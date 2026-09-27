package com.example.backend.english.controller;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.backend.english.agent.AgentChatService;
import com.example.backend.auth.JwtAuth;
import com.example.backend.english.entity.EnglishStudyLog;
import com.example.backend.english.entity.EnglishVariant;
import com.example.backend.english.entity.EnglishWrongExt;
import com.example.backend.english.mapper.EnglishStudyLogMapper;
import com.example.backend.english.mapper.EnglishVariantMapper;
import com.example.backend.english.mapper.EnglishWrongExtMapper;
import com.example.backend.english.rag.WikiKnowledgeService;
import com.example.backend.entity.UserWrongQuestion;
import com.example.backend.mapper.UserWrongQuestionMapper;
import com.example.backend.reading.entity.ReadingArticle;
import com.example.backend.reading.mapper.ReadingArticleMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.Resource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;

/**
 * 错题练习（PDCA 阶段3 攻克升级）：针对单道英语错题的强化练习。
 * 两种题循环出，直到做对：
 * - variant 变式题：同考点加深一层，3 个错误选项与正确选项意思相近（考生已看过解析，弱干扰无效）；
 * - similar 同类型题：与原题同题型（main/detail/guess…）同难度，原文只给答案依据所在的那一段。
 * 攻克规则：当前一轮（每种 kind 最新一题）变式题 + 同类型题都答对 → backflow_flag=0 退出回流。
 * 错题正文依旧只读 user_wrong_question（不修改 falselate 的表），练习题落 english_variant（kind 写进 content，不动表结构）。
 */
@RestController
@RequestMapping("/api/english/wrong/practice")
public class EnglishPracticeController {

    private static final Logger log = LoggerFactory.getLogger(EnglishPracticeController.class);

    /** 英语错题的 question_id 前缀（与 EnglishWrongController 保持一致） */
    private static final String ENGLISH_PREFIX = "reading-";

    /** 选项强干扰规则：考生已看过解析知道正确答案，错误选项必须贴近正确意思才有效 */
    private static final String OPTION_RULE = "3 个错误选项必须与正确选项意思相近（近义替换、程度或范围微调、主体与对象互换、过度推断等强干扰手法），"
            + "不允许出现一眼假的说法；考生已经看过原题解析并知道正确答案。";

    @Resource
    private JwtAuth jwtAuth;
    @Resource
    private UserWrongQuestionMapper wrongQuestionMapper;
    @Resource
    private EnglishVariantMapper variantMapper;
    @Resource
    private EnglishWrongExtMapper extMapper;
    @Resource
    private EnglishStudyLogMapper studyLogMapper;
    @Resource
    private ReadingArticleMapper readingArticleMapper;
    @Resource
    private AgentChatService agentChatService;
    @Resource
    private WikiKnowledgeService wikiKnowledgeService;
    @Resource
    private ObjectMapper objectMapper;

    /**
     * 出题：POST /api/english/wrong/practice/generate {questionId, kind}
     * kind = variant 变式题 / similar 同类型题（带原文片段）。每次调用都出新题（做错后循环重来）。
     */
    @PostMapping("/generate")
    public Map<String, Object> generate(@RequestBody Map<String, String> body) {
        Map<String, Object> res = new HashMap<>();
        Long userId = jwtAuth.getCurrentUserId();
        String questionId = body.get("questionId");
        String kind = body.get("kind");
        if (questionId == null || !questionId.startsWith(ENGLISH_PREFIX)
                || (!"variant".equals(kind) && !"similar".equals(kind))) {
            res.put("code", 400);
            res.put("msg", "非法的请求参数");
            return res;
        }

        // 错题正文只读错题本表（SELECT，不修改）
        UserWrongQuestion row = wrongQuestionMapper.selectOne(Wrappers.<UserWrongQuestion>lambdaQuery()
                .eq(UserWrongQuestion::getUserId, userId)
                .eq(UserWrongQuestion::getQuestionId, questionId)
                .last("LIMIT 1"));
        if (row == null) {
            res.put("code", 404);
            res.put("msg", "错题不存在");
            return res;
        }
        Map<?, ?> orig;
        try {
            orig = objectMapper.readValue(row.getQuestionContent(), Map.class);
        } catch (Exception e) {
            res.put("code", 500);
            res.put("msg", "错题内容解析失败");
            return res;
        }

        // RAG 检索考点上下文，约束新题不跑偏
        StringBuilder knowledge = new StringBuilder();
        try {
            for (WikiKnowledgeService.SearchHit hit : wikiKnowledgeService.search(row.getQuestionContent(), null, 3)) {
                var k = hit.knowledge();
                knowledge.append("- ").append(k.getTitle()).append("：")
                        .append(k.getContent() == null ? "" : k.getContent()).append("\n");
            }
        } catch (Exception ignored) { }

        try {
            Map<String, Object> gen = "variant".equals(kind)
                    ? generateVariant(row, orig, questionId, knowledge)
                    : generateSimilar(row, orig, questionId, knowledge);
            gen.put("kind", kind);
            // AI 爱把正确答案放在固定位置，洗牌打散；并强制避开原题正确字母（随机仍可能撞回原题字母）
            shuffleOptions(gen, row.getCorrectAnswer() == null ? null
                    : String.valueOf(row.getCorrectAnswer()).trim().toUpperCase());

            // 入库 english_variant：kind 写进 content JSON，不加列、不动表结构
            EnglishVariant v = new EnglishVariant();
            v.setUserId(userId);
            v.setSourceQuestionId(questionId);
            v.setQuestionContent(objectMapper.writeValueAsString(gen));
            variantMapper.insert(v);

            Map<String, Object> view = new LinkedHashMap<>(gen);
            view.put("id", v.getId());
            res.put("code", 200);
            res.put("data", view);
        } catch (Exception e) {
            log.warn("错题练习出题失败[{}] {}", kind, questionId, e);   // 全栈日志，便于定位超时/限流/解析问题
            res.put("code", 500);
            res.put("msg", "AI 出题失败：" + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
        return res;
    }

    /**
     * 选项洗牌：打乱 options 并重新分配 A/B/C/D 字母，同步更新 answer。
     * 模型出题时正确选项常固定落在同一字母位，不做这道会导致原题和练习题答案字母全相同；
     * 洗牌后若正确字母仍与原题相同（forbidden），强制与相邻字母互换，保证练习题答案不落在原题字母上。
     */
    @SuppressWarnings("unchecked")
    private void shuffleOptions(Map<String, Object> gen, String forbidden) {
        Object optsObj = gen.get("options");
        Object ansObj = gen.get("answer");
        if (!(optsObj instanceof Map) || ansObj == null) return;
        Map<String, Object> opts = (Map<String, Object>) optsObj;
        String ans = String.valueOf(ansObj).trim().toUpperCase();
        Object correctValue = opts.get(ans);
        if (correctValue == null) return;   // answer 字母和 options 对不上就不动（交给前端兜底展示）
        List<Map.Entry<String, Object>> entries = new ArrayList<>(opts.entrySet());
        Collections.shuffle(entries);
        String[] letters = {"A", "B", "C", "D", "E", "F", "G", "H"};
        Map<String, Object> reshuffled = new LinkedHashMap<>();
        String newAns = null;
        for (int i = 0; i < entries.size() && i < letters.length; i++) {
            reshuffled.put(letters[i], entries.get(i).getValue());
            if (entries.get(i).getKey().equals(ans)) newAns = letters[i];
        }
        // 撞上原题字母了：把正确选项和另一个字母的选项互换，强制错开
        if (forbidden != null && !forbidden.isBlank() && forbidden.equals(newAns)) {
            for (String l : letters) {
                if (!l.equals(forbidden) && reshuffled.containsKey(l)) {
                    Object other = reshuffled.get(l);
                    reshuffled.put(l, correctValue);
                    reshuffled.put(forbidden, other);
                    newAns = l;
                    break;
                }
            }
        }
        gen.put("options", reshuffled);
        gen.put("answer", newAns);
    }

    /**
     * 变式题：同一篇文章、同一考点段落，但加深一层，且正确选项必须换表述——
     * 考生已看过原题解析，若正确选项只是原题答案的近义复述，靠回忆就能猜中。
     * 模型此前拿不到原文，导致正确选项与原题答案同义或凭空虚构 passage，所以这里把原文一并给它。
     */
    private Map<String, Object> generateVariant(UserWrongQuestion row, Map<?, ?> orig,
                                                String questionId, StringBuilder knowledge) throws Exception {
        // 反查原文段落（reading-{articleId}-{题号}）
        String passageBlock = null;
        try {
            String[] parts = questionId.split("-");
            ReadingArticle article = readingArticleMapper.selectById(Long.parseLong(parts[1]));
            if (article != null) passageBlock = paragraphsOf(article);
        } catch (Exception e) {
            log.warn("变式题反查原文失败 {}: {}", questionId, e.getMessage());
        }
        if (passageBlock == null || passageBlock.isBlank()) {
            throw new IllegalStateException("找不到原文，无法出变式题");
        }

        String sys = "你是英语阅读出题老师。只输出一个 JSON 对象，禁止 markdown 代码块和多余文字，格式："
                + "{\"passage\":\"新题答案依据所在的那一段英文原文（原样摘录自下方文章的某一段）\","
                + "\"question\":\"英文题干\",\"options\":{\"A\":\"...\",\"B\":\"...\",\"C\":\"...\",\"D\":\"...\"},"
                + "\"answer\":\"正确选项字母\",\"explain\":\"中文解析\"}";
        String user = "下面是一篇英语文章，我在这篇文章的一道题上答错了（已看过解析）：\n"
                + "原题题干：" + orig.get("question")
                + "\n原题正确答案：" + row.getCorrectAnswer()
                + (knowledge.isEmpty() ? "" : "\n考点参考：\n" + knowledge)
                + "\n\n文章全文：\n" + passageBlock
                + "\n\n请基于这篇文章出 1 道更难的变式题，要求：\n"
                + "1. 考查段落与原题相关，但问法要加深一层（推理、对比、细节辨析、因果关系或作者意图），不能只是换个问法复述。\n"
                + "2. 正确选项必须是全新的表述，禁止与原题正确答案意思相同或相近——考生记得原题答案，靠近义复述就能猜中；新题答案要依据原文里另一处关键信息或更深一层的推断，仅凭回忆原题答案无法作答。\n"
                + "3. passage 给出新题答案依据所在的那一段，原样摘录。\n"
                + "4. " + OPTION_RULE + "\n"
                + "5. 难度略高于原题；explain 用中文说明正确项为什么对、其余三项分别错在哪。";
        String raw = agentChatService.chat(sys, user, 2500);
        return objectMapper.readValue(AgentChatService.extractJson(raw), Map.class);
    }

    /**
     * 同类型题：AI 现场原创一段英文短文（不取题库文章），只出 1 道与原题同题型的题。
     * 原文章的题用户已看过解析，再考原文没有意义，所以短文完全新写。
     */
    private Map<String, Object> generateSimilar(UserWrongQuestion row, Map<?, ?> orig,
                                                String questionId, StringBuilder knowledge) throws Exception {
        String typeCode = null;
        String level = null;
        try {
            String[] parts = questionId.split("-");
            long origArticleId = Long.parseLong(parts[1]);
            int qi = Integer.parseInt(parts[2]);
            ReadingArticle origArticle = readingArticleMapper.selectById(origArticleId);
            if (origArticle != null) {
                level = origArticle.getLevel();
                List<?> qs = (List<?>) ((Map<?, ?>) objectMapper.readValue(origArticle.getContent(), Map.class)).get("questions");
                if (qs != null && qi >= 0 && qi < qs.size()) {
                    Object t = ((Map<?, ?>) qs.get(qi)).get("type");
                    typeCode = t == null ? null : String.valueOf(t);
                }
            }
        } catch (Exception e) {
            log.warn("同类型题反查原题信息失败 {}: {}", questionId, e.getMessage());
        }
        String typeName = switch (typeCode == null ? "" : typeCode) {
            case "main" -> "主旨大意题";
            case "detail" -> "细节理解题";
            case "guess" -> "猜词题";
            case "infer" -> "推理判断题";
            default -> typeCode == null ? "阅读理解题" : typeCode;
        };
        String levelName = switch (level == null ? "" : level) {
            case "6" -> "大学六级";
            case "ky" -> "考研";
            default -> "大学四级";
        };

        String sys = "你是英语阅读出题老师。只输出一个 JSON 对象，禁止 markdown 代码块和多余文字，格式："
                + "{\"passage\":\"你原创的英文短文原文（只有一段）\","
                + "\"question\":\"英文题干\",\"options\":{\"A\":\"...\",\"B\":\"...\",\"C\":\"...\",\"D\":\"...\"},"
                + "\"answer\":\"正确选项字母\",\"explain\":\"中文解析\",\"type\":\"" + (typeCode == null ? "detail" : typeCode) + "\"}";
        // 只给题型和难度，不透露原题题干/答案/话题，避免新题的正确选项被原题锚定成同一个意思
        String user = "请全新原创一篇英文短文，并基于它出 1 道同类型题，要求：\n"
                + "1. 短文完全原创、话题随机自选但要具体（人物/事件/场景，贴近日常生活或社会话题），"
                + "只有 1 段，80~120 词，" + levelName + "水平。\n"
                + "2. 只出 1 道题，题型为" + typeName + "，难度与之相当；题干、选项、答案只能依据这篇新短文。\n"
                + "3. passage 原样输出你写的这段短文。\n"
                + "4. " + OPTION_RULE + "\n"
                + "5. explain 用中文说明正确项为什么对、其余三项分别错在哪。";
        String raw = agentChatService.chat(sys, user, 2500);
        Map<String, Object> gen = objectMapper.readValue(AgentChatService.extractJson(raw), Map.class);
        gen.put("source", "ai");   // 标记短文为 AI 原创产出
        return gen;
    }

    /**
     * 作答回写：POST /api/english/wrong/practice/answer {itemId, correct}
     * 当前一轮（每种 kind 最新一题）都答对 → 攻克退出回流；答错留在回流池，前端换题重来。
     */
    @PostMapping("/answer")
    public Map<String, Object> answer(@RequestBody Map<String, Object> body) {
        Map<String, Object> res = new HashMap<>();
        Long userId = jwtAuth.getCurrentUserId();
        Long itemId = Long.valueOf(String.valueOf(body.get("itemId")));
        boolean correct = Boolean.parseBoolean(String.valueOf(body.get("correct")));

        EnglishVariant v = variantMapper.selectById(itemId);
        if (v == null || !v.getUserId().equals(userId)) {
            res.put("code", 404);
            res.put("msg", "题目不存在");
            return res;
        }
        v.setCorrect(correct ? 1 : 0);
        v.setAnsweredAt(LocalDateTime.now());
        variantMapper.updateById(v);

        // 学习事件日志（周报统计源，logType=2 错题重做），失败不影响主流程
        try {
            EnglishStudyLog lg = new EnglishStudyLog();
            lg.setUserId(userId);
            lg.setLogType(2);
            lg.setRefId(v.getId());
            lg.setCorrect(correct ? 1 : 0);
            lg.setCreatedAt(LocalDateTime.now());
            studyLogMapper.insert(lg);
        } catch (Exception ignored) { }

        // 攻克判定：变式题 + 同类型题（各自最新一题）都答对
        boolean conquered = false;
        if (correct) {
            EnglishVariant lv = latestOfKind(userId, v.getSourceQuestionId(), "variant");
            EnglishVariant ls = latestOfKind(userId, v.getSourceQuestionId(), "similar");
            if (lv != null && ls != null
                    && Integer.valueOf(1).equals(lv.getCorrect())
                    && Integer.valueOf(1).equals(ls.getCorrect())) {
                EnglishWrongExt ext = upsertExt(userId, v.getSourceQuestionId());
                ext.setBackflowFlag(0);
                extMapper.updateById(ext);
                conquered = true;
            }
        }
        res.put("code", 200);
        res.put("correct", correct);
        res.put("conquered", conquered);
        return res;
    }

    /** kind 存在 content JSON 里，按 id 倒序解析找该 kind 最新一题 */
    private EnglishVariant latestOfKind(Long userId, String questionId, String kind) {
        for (EnglishVariant row : variantMapper.selectList(Wrappers.<EnglishVariant>lambdaQuery()
                .eq(EnglishVariant::getUserId, userId)
                .eq(EnglishVariant::getSourceQuestionId, questionId)
                .orderByDesc(EnglishVariant::getId))) {
            try {
                Map<?, ?> c = objectMapper.readValue(row.getQuestionContent(), Map.class);
                if (kind.equals(c.get("kind"))) return row;
            } catch (Exception ignored) { }
        }
        return null;
    }

    /** 把文章各段拼成编号文本（仅英文句子），供出题提示词使用 */
    private String paragraphsOf(ReadingArticle article) throws Exception {
        Map<?, ?> content = objectMapper.readValue(article.getContent(), Map.class);
        List<?> paragraphs = (List<?>) content.get("paragraphs");
        StringBuilder sb = new StringBuilder();
        for (int i = 0; paragraphs != null && i < paragraphs.size(); i++) {
            Map<?, ?> p = (Map<?, ?>) paragraphs.get(i);
            List<?> sentences = (List<?>) p.get("sentences");
            String text = sentences == null
                    ? String.valueOf(p.get("text"))
                    : String.join(" ", sentences.stream().map(String::valueOf).toList());
            sb.append("【第").append(i + 1).append("段】").append(text).append("\n");
        }
        return sb.toString();
    }

    /** 按 (userId, questionId) 取扩展行，没有则建初始行（backflow_flag=1 待攻克） */
    private EnglishWrongExt upsertExt(Long userId, String questionId) {
        EnglishWrongExt ext = extMapper.selectOne(Wrappers.<EnglishWrongExt>lambdaQuery()
                .eq(EnglishWrongExt::getUserId, userId)
                .eq(EnglishWrongExt::getQuestionId, questionId));
        if (ext == null) {
            ext = new EnglishWrongExt();
            ext.setUserId(userId);
            ext.setQuestionId(questionId);
            ext.setRedoCount(0);
            ext.setBackflowFlag(1);
            extMapper.insert(ext);
        }
        return ext;
    }
}
