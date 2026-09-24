package com.example.backend.english.controller;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.backend.english.agent.AgentChatService;
import com.example.backend.auth.JwtAuth;
import com.example.backend.english.entity.EnglishVariant;
import com.example.backend.english.entity.EnglishWrongExt;
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
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * AI 变式题（阶段3）：错题同考点不同考法的挑战题。
 * 攻克规则升级：原题重做答对 + 至少 1 道变式题答对，才真正退出回流池——
 * 防止"记住答案"式攻克。题目 JSON 结构与阅读题一致（question/options/answer/type）。
 */
@RestController
@RequestMapping("/api/english/wrong/variant")
public class EnglishVariantController {

    private static final Logger log = LoggerFactory.getLogger(EnglishVariantController.class);

    @Resource
    private JwtAuth jwtAuth;
    @Resource
    private UserWrongQuestionMapper wrongQuestionMapper;
    @Resource
    private EnglishVariantMapper variantMapper;
    @Resource
    private EnglishWrongExtMapper extMapper;
    @Resource
    private AgentChatService agentChatService;
    @Resource
    private WikiKnowledgeService wikiKnowledgeService;
    @Resource
    private ObjectMapper objectMapper;

    /**
     * 生成变式题：POST /api/english/wrong/variant/generate {questionId}
     * 同一道题只生成一次，之后返回已有未作答的题（避免重复消耗 AI 额度）。
     */
    @PostMapping("/generate")
    public Map<String, Object> generate(@RequestBody Map<String, String> body) {
        Map<String, Object> res = new HashMap<>();
        Long userId = jwtAuth.getCurrentUserId();
        String questionId = body.get("questionId");

        // 已生成过的直接返回（未作答的 + 答错可重做的）
        List<EnglishVariant> exist = variantMapper.selectList(Wrappers.<EnglishVariant>lambdaQuery()
                .eq(EnglishVariant::getUserId, userId)
                .eq(EnglishVariant::getSourceQuestionId, questionId)
                .orderByAsc(EnglishVariant::getId));
        if (!exist.isEmpty()) {
            res.put("code", 200);
            res.put("variants", toView(exist));
            res.put("regenerated", false);
            return res;
        }

        // 错题正文只读错题本表
        UserWrongQuestion row = wrongQuestionMapper.selectOne(Wrappers.<UserWrongQuestion>lambdaQuery()
                .eq(UserWrongQuestion::getUserId, userId)
                .eq(UserWrongQuestion::getQuestionId, questionId)
                .last("LIMIT 1"));
        if (row == null) {
            res.put("code", 404);
            res.put("msg", "错题不存在");
            return res;
        }

        // RAG 检索考点上下文，约束变式题不跑偏
        StringBuilder knowledge = new StringBuilder();
        for (WikiKnowledgeService.SearchHit hit : wikiKnowledgeService.search(row.getQuestionContent(), null, 3)) {
            var k = hit.knowledge();
            knowledge.append("- ").append(k.getTitle()).append("：")
                    .append(k.getContent() == null ? "" : k.getContent()).append("\n");
        }

        try {
            String sys = "你是英语出题老师。只输出一个 JSON 数组（以 [ 开头、以 ] 结束，不要输出对象），禁止多余文字，包含2个题目对象，每个格式："
                    + "{\"question\":\"英文题干\",\"options\":{\"A\":\"...\",\"B\":\"...\",\"C\":\"...\",\"D\":\"...\"},"
                    + "\"answer\":\"正确选项字母\",\"explain\":\"中文解析\",\"type\":\"detail\"}。"
                    + "要求：与原题考同一个知识点，但语境、句子、问法都不同，选项干扰性要强。";
            String user = "原题：" + row.getQuestionContent()
                    + "\n我的答案：" + row.getUserAnswer() + "（答错，正确是 " + row.getCorrectAnswer() + "）"
                    + (knowledge.isEmpty() ? "" : "\n考点参考：\n" + knowledge);
            String raw = agentChatService.chat(sys, user, 1500);
            String json = AgentChatService.extractJson(raw);
            List<?> list;
            try {
                list = objectMapper.readValue(json, List.class);
            } catch (Exception notArray) {
                // 模型偶尔无视数组要求输出单个对象，包一层数组兼容
                list = List.of(objectMapper.readValue(json, Map.class));
            }

            List<EnglishVariant> saved = new ArrayList<>();
            for (Object o : list) {
                Map<?, ?> q = (Map<?, ?>) o;
                EnglishVariant v = new EnglishVariant();
                v.setUserId(userId);
                v.setSourceQuestionId(questionId);
                v.setQuestionContent(objectMapper.writeValueAsString(q));
                variantMapper.insert(v);
                saved.add(v);
            }
            res.put("code", 200);
            res.put("variants", toView(saved));
            res.put("regenerated", true);
        } catch (Exception e) {
            log.warn("变式题生成失败: {}", e.getMessage());
            res.put("code", 500);
            res.put("msg", "AI 出题失败，请稍后再试");
        }
        return res;
    }

    /**
     * 变式作答回写：POST /api/english/wrong/variant/answer {variantId, correct}
     * 答对时若原题最近一次重做也是对的 → 直接攻克退出回流。
     */
    @PostMapping("/answer")
    public Map<String, Object> answer(@RequestBody Map<String, Object> body) {
        Map<String, Object> res = new HashMap<>();
        Long userId = jwtAuth.getCurrentUserId();
        Long variantId = Long.valueOf(String.valueOf(body.get("variantId")));
        boolean correct = Boolean.parseBoolean(String.valueOf(body.get("correct")));

        EnglishVariant v = variantMapper.selectById(variantId);
        if (v == null || !v.getUserId().equals(userId)) {
            res.put("code", 404);
            res.put("msg", "题目不存在");
            return res;
        }
        v.setCorrect(correct ? 1 : 0);
        v.setAnsweredAt(LocalDateTime.now());
        variantMapper.updateById(v);

        // 攻克联动：变式答对 + 原题最近重做也答对 → 攻克
        boolean conquered = false;
        if (correct) {
            EnglishWrongExt ext = extMapper.selectOne(Wrappers.<EnglishWrongExt>lambdaQuery()
                    .eq(EnglishWrongExt::getUserId, userId)
                    .eq(EnglishWrongExt::getQuestionId, v.getSourceQuestionId())
                    .last("LIMIT 1"));
            if (ext != null && ext.getLastRedoCorrect() != null && ext.getLastRedoCorrect() == 1
                    && ext.getBackflowFlag() != null && ext.getBackflowFlag() == 1) {
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

    private List<Map<String, Object>> toView(List<EnglishVariant> rows) {
        List<Map<String, Object>> view = new ArrayList<>();
        for (EnglishVariant v : rows) {
            Map<String, Object> m = new HashMap<>();
            m.put("id", v.getId());
            m.put("correct", v.getCorrect());
            try {
                m.put("question", objectMapper.readValue(v.getQuestionContent(), Map.class));
            } catch (Exception e) {
                m.put("question", null);
            }
            view.add(m);
        }
        return view;
    }
}
