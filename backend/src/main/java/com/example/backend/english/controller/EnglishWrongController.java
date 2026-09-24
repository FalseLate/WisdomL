package com.example.backend.english.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
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
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.Resource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;

/**
 * 英语错题复习（PDCA 阶段0）：
 * 错题正文只读 user_wrong_question（falselate 的错题本，只 SELECT 不改结构与代码），
 * 错因 / 重做 / 回流等英语学情数据全部落自己的 english_wrong_ext 扩展表。
 */
@RestController
@RequestMapping("/api/english/wrong")
public class EnglishWrongController {

    private static final Logger log = LoggerFactory.getLogger(EnglishWrongController.class);

    /** 英语错题的 question_id 前缀：目前英语自己的错题只有阅读题来源 */
    private static final String ENGLISH_PREFIX = "reading-";

    @Resource
    private JwtAuth jwtAuth;
    @Resource
    private UserWrongQuestionMapper wrongQuestionMapper;
    @Resource
    private EnglishWrongExtMapper extMapper;
    @Resource
    private EnglishStudyLogMapper studyLogMapper;
    @Resource
    private EnglishVariantMapper variantMapper;
    @Resource
    private AgentChatService agentChatService;
    @Resource
    private WikiKnowledgeService wikiKnowledgeService;
    @Resource
    private ObjectMapper objectMapper;

    /** 英语错题列表：正文（只读）+ 我的扩展字段合并返回 */
    @GetMapping("/list")
    public Map<String, Object> list() {
        Map<String, Object> res = new HashMap<>();
        Long userId = jwtAuth.getCurrentUserId();

        // 只取英语来源的错题行（question_id 以 reading- 开头），未移除的
        List<UserWrongQuestion> rows = wrongQuestionMapper.selectList(
                new LambdaQueryWrapper<UserWrongQuestion>()
                        .eq(UserWrongQuestion::getUserId, userId)
                        .eq(UserWrongQuestion::getIsRemoved, 0)
                        .likeRight(UserWrongQuestion::getQuestionId, ENGLISH_PREFIX)
                        .orderByDesc(UserWrongQuestion::getUpdatedAt));

        // 我的扩展表按 questionId 建索引
        Map<String, EnglishWrongExt> extMap = new HashMap<>();
        for (EnglishWrongExt ext : extMapper.selectList(
                Wrappers.<EnglishWrongExt>lambdaQuery().eq(EnglishWrongExt::getUserId, userId))) {
            extMap.put(ext.getQuestionId(), ext);
        }

        List<Map<String, Object>> data = new ArrayList<>();
        for (UserWrongQuestion row : rows) {
            Map<String, Object> m = new HashMap<>();
            m.put("questionId", row.getQuestionId());
            m.put("questionContent", row.getQuestionContent());
            m.put("questionType", row.getQuestionType());
            m.put("userAnswer", row.getUserAnswer());
            m.put("correctAnswer", row.getCorrectAnswer());
            m.put("explanation", row.getExplanation());
            m.put("wrongCount", row.getWrongCount());
            EnglishWrongExt ext = extMap.get(row.getQuestionId());
            m.put("errorTypeIds", ext != null ? ext.getErrorTypeIds() : null);
            m.put("redoCount", ext != null && ext.getRedoCount() != null ? ext.getRedoCount() : 0);
            m.put("backflowFlag", ext != null && ext.getBackflowFlag() != null ? ext.getBackflowFlag() : 1);
            data.add(m);
        }
        res.put("code", 200);
        res.put("data", data);
        return res;
    }

    /** 错因标记：手动勾选保存（阶段2 Agent 自动识别后仍允许覆盖） */
    @PostMapping("/error-types")
    public Map<String, Object> setErrorTypes(@RequestBody Map<String, String> body) {
        Map<String, Object> res = new HashMap<>();
        Long userId = jwtAuth.getCurrentUserId();
        String questionId = body.get("questionId");
        String errorTypeIds = body.get("errorTypeIds");
        if (questionId == null || !questionId.startsWith(ENGLISH_PREFIX)) {
            res.put("code", 400);
            res.put("msg", "非法的题目标识");
            return res;
        }
        EnglishWrongExt ext = upsertExt(userId, questionId);
        ext.setErrorTypeIds(errorTypeIds == null || errorTypeIds.isBlank() ? null : errorTypeIds);
        extMapper.updateById(ext);
        res.put("code", 200);
        return res;
    }

    /** 重做结果：答对标记已攻克（回流=0），答错保持回流，等下一轮 PDCA 再来 */
    @PostMapping("/redo")
    public Map<String, Object> redo(@RequestBody Map<String, Object> body) {
        Map<String, Object> res = new HashMap<>();
        Long userId = jwtAuth.getCurrentUserId();
        String questionId = (String) body.get("questionId");
        boolean correct = Boolean.parseBoolean(String.valueOf(body.get("correct")));
        if (questionId == null || !questionId.startsWith(ENGLISH_PREFIX)) {
            res.put("code", 400);
            res.put("msg", "非法的题目标识");
            return res;
        }
        EnglishWrongExt ext = upsertExt(userId, questionId);
        ext.setRedoCount((ext.getRedoCount() == null ? 0 : ext.getRedoCount()) + 1);
        // 阶段3攻克规则升级：原题答对不再直接攻克，先记录 lastRedoCorrect，
        // 需再通过至少 1 道 AI 变式题（variant/answer 里联动置 0）才算真正掌握
        ext.setLastRedoCorrect(correct ? 1 : 0);
        boolean variantPassed = variantMapper.selectCount(Wrappers.<EnglishVariant>lambdaQuery()
                .eq(EnglishVariant::getUserId, userId)
                .eq(EnglishVariant::getSourceQuestionId, questionId)
                .eq(EnglishVariant::getCorrect, 1)) > 0;
        if (correct) {
            ext.setBackflowFlag(variantPassed ? 0 : 1);
        } else {
            ext.setBackflowFlag(1);
        }
        ext.setLastRedoAt(LocalDateTime.now());
        extMapper.updateById(ext);

        // 学习事件日志：周报统计源（失败不影响重做主流程）
        try {
            EnglishStudyLog lg = new EnglishStudyLog();
            lg.setUserId(userId);
            lg.setLogType(2);
            lg.setRefId(ext.getId());
            lg.setCorrect(correct ? 1 : 0);
            lg.setCreatedAt(LocalDateTime.now());
            studyLogMapper.insert(lg);
        } catch (Exception ignored) { }

        res.put("code", 200);
        res.put("redoCount", ext.getRedoCount());
        res.put("backflowFlag", ext.getBackflowFlag());
        // 答对但因变式题未过关仍回流时，提示前端引导去做变式挑战
        res.put("needVariant", correct && ext.getBackflowFlag() == 1);
        return res;
    }

    /** AI 自动错因识别：题干+我的答案+正确答案 → Agent 按 1审题/2知识/3策略/4逻辑/5习惯 打标，结果可手动覆盖 */
    @PostMapping("/auto-tag")
    public Map<String, Object> autoTag(@RequestBody Map<String, String> body) {
        Map<String, Object> res = new HashMap<>();
        Long userId = jwtAuth.getCurrentUserId();
        String questionId = body.get("questionId");
        if (questionId == null || !questionId.startsWith(ENGLISH_PREFIX)) {
            res.put("code", 400);
            res.put("msg", "非法的题目标识");
            return res;
        }
        // 错题正文只读别人的表（SELECT，不修改）
        UserWrongQuestion row = wrongQuestionMapper.selectOne(
                Wrappers.<UserWrongQuestion>lambdaQuery()
                        .eq(UserWrongQuestion::getUserId, userId)
                        .eq(UserWrongQuestion::getQuestionId, questionId));
        if (row == null) {
            res.put("code", 404);
            res.put("msg", "错题不存在");
            return res;
        }

        // RAG 检索错题题干相关知识，给 Agent 提供判错依据
        StringBuilder knowledge = new StringBuilder();
        for (WikiKnowledgeService.SearchHit hit : wikiKnowledgeService.search(row.getQuestionContent(), null, 3)) {
            var k = hit.knowledge();
            knowledge.append("- ").append(k.getTitle()).append("：")
                    .append(k.getContent() == null ? "" : k.getContent()).append("\n");
        }

        try {
            String sys = "你是英语错因分析师。只输出一个 JSON 对象，禁止多余文字，格式："
                    + "{\"errorTypeIds\":[数字],\"reason\":\"中文一句话解释\"}。"
                    + "错因分类：1=审题失误，2=知识点不会（词汇/语法），3=解题策略不当，4=逻辑推理错误，5=粗心习惯。"
                    + "errorTypeIds 从 1-5 里选 1 到 2 个最贴切的。";
            String user = "题干：" + row.getQuestionContent() + "\n我的答案：" + row.getUserAnswer()
                    + "\n正确答案：" + row.getCorrectAnswer()
                    + "\n已有解析：" + (row.getExplanation() == null ? "无" : row.getExplanation())
                    + (knowledge.isEmpty() ? "" : "\n相关知识点：\n" + knowledge);
            String raw = agentChatService.chat(sys, user, 300);
            Map<?, ?> obj = objectMapper.readValue(AgentChatService.extractJson(raw), Map.class);

            // 校验并落扩展表（自动识别后仍可手动改）
            List<Integer> ids = new ArrayList<>();
            for (Object o : (List<?>) obj.get("errorTypeIds")) {
                int v = Integer.parseInt(String.valueOf(o));
                if (v >= 1 && v <= 5) ids.add(v);
            }
            if (ids.isEmpty()) throw new IllegalStateException("Agent 未给出有效错因");

            EnglishWrongExt ext = upsertExt(userId, questionId);
            ext.setErrorTypeIds(ids.stream().map(String::valueOf).reduce((a, b) -> a + "," + b).orElse(null));
            extMapper.updateById(ext);

            res.put("code", 200);
            res.put("errorTypeIds", ext.getErrorTypeIds());
            res.put("reason", String.valueOf(obj.get("reason")));
        } catch (Exception e) {
            log.warn("AI 错因识别失败: {}", e.getMessage());
            res.put("code", 500);
            res.put("msg", "AI 识别失败，可手动勾选错因");
        }
        return res;
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
