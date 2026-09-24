package com.example.backend.english.controller;

import com.example.backend.auth.JwtAuth;
import com.example.backend.english.agent.AgentChatService;
import com.example.backend.english.rag.WikiKnowledgeService;
import com.example.backend.entity.UserWord;
import com.example.backend.entity.Word;
import com.example.backend.reading.entity.ReadingArticle;
import com.example.backend.reading.mapper.ReadingArticleMapper;
import com.example.backend.service.UserWordService;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.Resource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;

/**
 * 阶段2 Agent 能力接口：
 * - Plan：今日任务播报数据（气泡用）
 * - Do：AI 对话挖空抽查 / AI 个性化阅读生成
 * 降级原则：Agent（chat）或 RAG 不可用时，挖空抽查回落公共Wiki例句、播报回落纯计数，系统不瘫。
 */
@RestController
@RequestMapping("/api/english")
public class EnglishAgentController {

    private static final Logger log = LoggerFactory.getLogger(EnglishAgentController.class);

    /** 挖空选项的兜底干扰词（生词太少时补位） */
    private static final List<String> FALLBACK_DISTRACTORS =
            List.of("library", "robot", "quiet", "always", "helping", "place", "books", "students");

    @Resource
    private JwtAuth jwtAuth;
    @Resource
    private UserWordService userWordService;
    @Resource
    private AgentChatService agentChatService;
    @Resource
    private WikiKnowledgeService wikiKnowledgeService;
    @Resource
    private com.example.backend.english.mapper.EnglishWrongExtMapper extMapper;
    @Resource
    private ReadingArticleMapper readingArticleMapper;
    @Resource
    private ObjectMapper objectMapper;

    // ================= Plan：今日任务播报 =================

    /** 气泡/首页播报数据：待复习生词数 + 未攻克英语错题数（只查自己的表，不碰别人的） */
    @GetMapping("/plan/today")
    public Map<String, Object> planToday() {
        Map<String, Object> res = new HashMap<>();
        Long userId = jwtAuth.getCurrentUserId();
        int dueWords = userWordService.getDueWords(userId).size();
        int wrongOpen = extMapper.selectCount(
                com.baomidou.mybatisplus.core.toolkit.Wrappers.<com.example.backend.english.entity.EnglishWrongExt>lambdaQuery()
                        .eq(com.example.backend.english.entity.EnglishWrongExt::getUserId, userId)
                        .eq(com.example.backend.english.entity.EnglishWrongExt::getBackflowFlag, 1))
                .intValue();
        res.put("code", 200);
        res.put("dueWords", dueWords);
        res.put("wrongOpen", wrongOpen);
        return res;
    }

    // ================= Do：AI 对话挖空抽查 =================

    /**
     * 生成一道挖空题：从今日到期生词里挑一个，优先用公共Wiki例句，Wiki没有则 Agent 造句，
     * Agent 不可用时也能出题（降级），答案回写走既有 /word/review/finish 调度。
     */
    @GetMapping("/quiz/blank")
    public Map<String, Object> blankQuiz() {
        Map<String, Object> res = new HashMap<>();
        Long userId = jwtAuth.getCurrentUserId();

        // 1. 到期生词里随机挑一个
        List<UserWord> due = userWordService.getDueWords(userId);
        if (due.isEmpty()) {
            res.put("code", 200);
            res.put("data", null);   // 今日无到期词
            return res;
        }
        Map<Long, Word> wordMap = new HashMap<>();
        for (Word w : userWordService.getUserCollectWords(userId)) {
            wordMap.put(w.getId(), w);
        }
        UserWord pick = due.get(new Random().nextInt(due.size()));
        Word word = wordMap.get(pick.getWordId());
        if (word == null) {
            res.put("code", 200);
            res.put("data", null);
            return res;
        }

        // 2. 例句来源：公共Wiki → Agent 造句
        String sentence = null;
        String source = "wiki";
        List<WikiKnowledgeService.SearchHit> hits = wikiKnowledgeService.search(word.getWord(), null, 3);
        for (WikiKnowledgeService.SearchHit hit : hits) {
            String ex = hit.knowledge().getExampleSentence();
            if (ex != null && ex.toLowerCase().contains(word.getWord().toLowerCase())) {
                sentence = ex.split("\n")[0].trim();
                break;
            }
        }
        if (sentence == null) {
            try {
                String raw = agentChatService.chat(
                        "你是英语老师。只输出一个 JSON 对象，格式：{\"sentence\":\"用这个单词造一个8到15个单词的简单陈述句\"}",
                        "单词：" + word.getWord() + "（" + word.getCnMean() + "）", 200);
                Map<?, ?> obj = objectMapper.readValue(AgentChatService.extractJson(raw), Map.class);
                sentence = String.valueOf(obj.get("sentence"));
                source = "ai";
            } catch (Exception e) {
                log.warn("挖空造句 Agent 失败，用 Wiki 释义兜底: {}", e.getMessage());
            }
        }
        if (sentence == null) {
            // 兜底：连 Agent 都不可用，用词库里的 sentence 字段或释义拼一句
            sentence = word.getSentence() != null ? word.getSentence()
                    : "I want to learn the word " + word.getWord() + ".";
            source = "fallback";
        }

        // 3. 挖空（大小写不敏感替换整个词）
        String blanked = sentence.replaceAll("(?i)\\b" + java.util.regex.Pattern.quote(word.getWord()) + "\\b", "____");
        if (!blanked.contains("____")) {
            blanked = sentence;   // 例句里没出现该词就整句展示让用户选词义
        }

        // 4. 干扰项：其他生词优先，不够用兜底词表补齐（去重，不与正确词/已选干扰词重复）
        List<String> distractors = new ArrayList<>();
        for (Word w : wordMap.values()) {
            if (distractors.size() >= 3) break;
            String t = w.getWord();
            if (t != null && !w.getId().equals(word.getId())
                    && !t.equalsIgnoreCase(word.getWord()) && !containsIgnoreCase(distractors, t)) {
                distractors.add(t);
            }
        }
        for (String fb : FALLBACK_DISTRACTORS) {
            if (distractors.size() >= 3) break;
            if (!fb.equalsIgnoreCase(word.getWord()) && !containsIgnoreCase(distractors, fb)) {
                distractors.add(fb);
            }
        }
        List<String> options = new ArrayList<>(List.of(word.getWord()));
        for (String d : distractors.subList(0, Math.min(3, distractors.size()))) options.add(d);
        Collections.shuffle(options);

        Map<String, Object> data = new HashMap<>();
        data.put("wordId", word.getId());
        data.put("word", word.getWord());
        data.put("sentence", blanked);
        data.put("options", options);
        data.put("source", source);
        res.put("code", 200);
        res.put("data", data);
        return res;
    }

    /** 忽略大小写的去重辅助 */
    private static boolean containsIgnoreCase(List<String> list, String s) {
        return list.stream().anyMatch(x -> x.equalsIgnoreCase(s));
    }

    // ================= Do：AI 个性化阅读生成 =================

    /**
     * 用当前用户的薄弱生词生成一篇短文 + 3 道理解题，直接入库 reading_article（genre=ai 标记来源），
     * 复用现有阅读→做题→错题本链路。RAG 检索相关知识注入提示词。
     */
    @PostMapping("/reading/generate")
    public Map<String, Object> generateReading() {
        Map<String, Object> res = new HashMap<>();
        Long userId = jwtAuth.getCurrentUserId();

        try {
            // 1. 薄弱生词（到期词，最多取 6 个）
            Map<Long, Word> wordMap = new HashMap<>();
            for (Word w : userWordService.getUserCollectWords(userId)) wordMap.put(w.getId(), w);
            List<Word> weak = new ArrayList<>();
            for (UserWord uw : userWordService.getDueWords(userId)) {
                Word w = wordMap.get(uw.getWordId());
                if (w != null) weak.add(w);
                if (weak.size() >= 6) break;
            }
            if (weak.isEmpty()) {
                res.put("code", 400);
                res.put("msg", "生词本里没有待复习的词，先去背单词收集几个吧");
                return res;
            }

            // 2. 难度档：取薄弱词里最难的档
            String level = weak.stream().map(Word::getLevel)
                    .filter(Objects::nonNull)
                    .map(l -> switch (l) { case "6", "ky" -> l; default -> "4"; })
                    .max(Comparator.comparingInt(l -> switch (l) { case "ky" -> 2; case "6" -> 1; default -> 0; }))
                    .orElse("4");

            // 3. RAG 检索相关知识点注入上下文
            String weakTexts = weak.stream().map(Word::getWord).reduce((a, b) -> a + ", " + b).orElse("");
            StringBuilder knowledge = new StringBuilder();
            for (WikiKnowledgeService.SearchHit hit : wikiKnowledgeService.search(weakTexts, null, 3)) {
                var k = hit.knowledge();
                knowledge.append("- ").append(k.getTitle()).append("：")
                        .append(k.getContent() == null ? "" : k.getContent()).append("\n");
            }

            // 4. Agent 生成结构化 JSON
            String sys = "你是英语分级阅读出题老师。只输出一个 JSON 对象，禁止 markdown 代码块和多余文字，格式："
                    + "{\"title\":\"英文标题\",\"paragraphs\":[{\"sentences\":[\"英文句\",\"英文句\",\"英文句\",\"英文句\"],\"translation\":\"这段的中文翻译\"}],"
                    + "\"questions\":[{\"stem\":\"英文题干\",\"options\":[\"A内容\",\"B内容\",\"C内容\",\"D内容\"],\"answer\":0,\"explain\":\"中文解析\",\"type\":\"main\"}]}";
            String user = "写一篇约180-220词的英语短文（3到4个段落，每段4到6句）。"
                    + "必须自然复现这些目标单词：" + weakTexts + "（每个词至少出现一次）。"
                    + "难度：大学" + ("6".equals(level) ? "六级" : "ky".equals(level) ? "考研" : "四级") + "水平。"
                    + (knowledge.isEmpty() ? "" : "可参考这些知识点出题：\n" + knowledge)
                    + "最后出3道阅读理解题（1道主旨题type=main、1道细节题type=detail、1道推理题type=infer），"
                    + "answer是正确选项的下标0-3，explain用中文解释为什么对。";
            String raw = agentChatService.chat(sys, user, 4000);
            Map<?, ?> gen = objectMapper.readValue(AgentChatService.extractJson(raw), Map.class);

            // 5. 组装入库（复用现有文章结构：paragraphs/translation/longSentences/questions）
            List<Map<String, Object>> paragraphs = new ArrayList<>();
            for (Object o : (List<?>) gen.get("paragraphs")) {
                Map<?, ?> p = (Map<?, ?>) o;
                Map<String, Object> np = new HashMap<>();
                np.put("sentences", p.get("sentences"));
                np.put("translation", p.get("translation"));
                np.put("longSentences", List.of());
                paragraphs.add(np);
            }
            Map<String, Object> content = new HashMap<>();
            content.put("title", String.valueOf(gen.get("title")));
            content.put("paragraphs", paragraphs);
            content.put("questions", gen.get("questions"));

            String title = String.valueOf(gen.get("title"));
            ReadingArticle article = new ReadingArticle();
            article.setTitle(title);
            article.setLevel(level);
            article.setGenre("ai");   // AI 生成来源标记，用于统计与质量监控
            article.setContent(objectMapper.writeValueAsString(content));
            article.setCreateTime(LocalDateTime.now());
            readingArticleMapper.insert(article);

            res.put("code", 200);
            res.put("id", article.getId());
            res.put("title", title);
            res.put("words", weakTexts);
        } catch (Exception e) {
            log.warn("AI 阅读生成失败: {}", e.getMessage());
            res.put("code", 500);
            res.put("msg", "生成失败，请稍后再试（Agent 接口异常或返回格式异常）");
        }
        return res;
    }
}
