package com.example.backend.english.rag;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.backend.english.agent.AgentChatService;
import com.example.backend.english.entity.EnglishWrongExt;
import com.example.backend.english.mapper.EnglishWrongExtMapper;
import com.example.backend.auth.JwtAuth;
import com.example.backend.entity.UserWrongQuestion;
import com.example.backend.mapper.UserWrongQuestionMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.Resource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Wiki 知识库接口：语义检索 + 阶段3 Act 的私人沉淀。
 * 沉淀链路：错题 → Agent 提炼知识缺口 → 写入该用户名下的私人条目（私人检索优先于公共）。
 */
@RestController
@RequestMapping("/api/wiki")
public class WikiController {

    private static final Logger log = LoggerFactory.getLogger(WikiController.class);

    @Resource
    private WikiKnowledgeService wikiKnowledgeService;
    @Resource
    private AgentChatService agentChatService;
    @Resource
    private JwtAuth jwtAuth;
    @Resource
    private UserWrongQuestionMapper wrongQuestionMapper;
    @Resource
    private EnglishWrongExtMapper extMapper;
    @Resource
    private ObjectMapper objectMapper;

    /** 语义检索：GET /api/wiki/search?q=...&type=4&topK=5（登录后私人条目优先） */
    @GetMapping("/search")
    public Map<String, Object> search(@RequestParam String q,
                                      @RequestParam(required = false) Integer type,
                                      @RequestParam(required = false, defaultValue = "0") int topK) {
        Map<String, Object> res = new HashMap<>();
        List<Map<String, Object>> data = new ArrayList<>();
        Long userId = safeUserId();
        for (WikiKnowledgeService.SearchHit hit : wikiKnowledgeService.search(q, type, topK, userId)) {
            WikiKnowledge k = hit.knowledge();
            Map<String, Object> m = new HashMap<>();
            m.put("id", k.getId());
            m.put("knowledgeType", k.getKnowledgeType());
            m.put("title", k.getTitle());
            m.put("content", k.getContent());
            m.put("exampleSentence", k.getExampleSentence());
            m.put("errorTypeIds", k.getErrorTypeIds());
            m.put("level", k.getLevel());
            m.put("isPrivate", k.getUserId() != null);
            m.put("score", Math.round(hit.getScore() * 1000) / 1000.0);
            data.add(m);
        }
        res.put("code", 200);
        res.put("ragEnabled", wikiKnowledgeService.isAvailable());
        res.put("data", data);
        return res;
    }

    /**
     * Act 沉淀：POST /api/wiki/absorb {questionId}
     * AI 从错题提炼知识缺口（考到的语法/词块/策略），写成我的私人 Wiki 条目。
     * 同一题重复提炼按标题去重，不产生重复条目。
     */
    @PostMapping("/absorb")
    public Map<String, Object> absorb(@RequestBody Map<String, String> body) {
        Map<String, Object> res = new HashMap<>();
        Long userId = jwtAuth.getCurrentUserId();
        String questionId = body.get("questionId");
        if (questionId == null || questionId.isBlank()) {
            res.put("code", 400);
            res.put("msg", "缺少题目标识");
            return res;
        }
        // 错题正文只读错题本表（SELECT，不修改）
        UserWrongQuestion row = wrongQuestionMapper.selectOne(
                Wrappers.<UserWrongQuestion>lambdaQuery()
                        .eq(UserWrongQuestion::getUserId, userId)
                        .eq(UserWrongQuestion::getQuestionId, questionId)
                        .last("LIMIT 1"));
        if (row == null) {
            res.put("code", 404);
            res.put("msg", "错题不存在");
            return res;
        }

        // 按题去重：这道题沉淀过就直接返回已有条目（AI 每次措辞不同，标题去重挡不住）
        EnglishWrongExt ext = extMapper.selectOne(Wrappers.<EnglishWrongExt>lambdaQuery()
                .eq(EnglishWrongExt::getUserId, userId)
                .eq(EnglishWrongExt::getQuestionId, questionId)
                .last("LIMIT 1"));
        if (ext != null && ext.getAbsorbedWikiId() != null) {
            WikiKnowledge exist = wikiKnowledgeService.getById(ext.getAbsorbedWikiId());
            if (exist != null) {
                res.put("code", 200);
                res.put("id", exist.getId());
                res.put("title", exist.getTitle());
                res.put("content", exist.getContent());
                return res;
            }
        }

        try {
            String sys = "你是英语学习笔记助手。只输出一个 JSON 对象，禁止多余文字，格式："
                    + "{\"knowledgeType\":数字,\"title\":\"知识点短标题(20字内)\",\"content\":\"中文讲解这个知识点，2到3句话，说清规则和易错点\","
                    + "\"exampleSentence\":\"1个能体现该知识点的英文例句\",\"level\":3}。"
                    + "knowledgeType 从这些里选：2=短语词块，3=语法点，4=阅读解题策略。"
                    + "title 要能代表这类问题的通用知识点（不是这一道题本身），方便以后复用。";
            String user = "我从这道英语题暴露了知识缺口，请提炼出一个值得记入笔记的知识点：\n"
                    + "题干：" + row.getQuestionContent()
                    + "\n我的答案：" + row.getUserAnswer()
                    + "\n正确答案：" + row.getCorrectAnswer()
                    + (row.getExplanation() == null ? "" : "\n解析：" + row.getExplanation());
            String raw = agentChatService.chat(sys, user, 500);
            Map<?, ?> obj = objectMapper.readValue(AgentChatService.extractJson(raw), Map.class);

            WikiKnowledge item = new WikiKnowledge();
            item.setKnowledgeType(safeType(obj.get("knowledgeType")));
            item.setTitle(String.valueOf(obj.get("title")));
            item.setContent(String.valueOf(obj.get("content")));
            item.setExampleSentence(String.valueOf(obj.get("exampleSentence")));
            item.setLevel(safeLevel(obj.get("level")));
            long id = wikiKnowledgeService.absorb(userId, item);

            // 记录这道题已沉淀到哪条笔记（下次同题请求直接返回，不再让 AI 重复提炼）
            EnglishWrongExt extRow = ext;
            if (extRow == null) {
                extRow = new EnglishWrongExt();
                extRow.setUserId(userId);
                extRow.setQuestionId(questionId);
                extRow.setRedoCount(0);
                extRow.setBackflowFlag(1);
            }
            extRow.setAbsorbedWikiId(id);
            if (extRow.getId() == null) {
                extMapper.insert(extRow);
            } else {
                extMapper.updateById(extRow);
            }

            res.put("code", 200);
            res.put("id", id);
            res.put("title", item.getTitle());
            res.put("content", item.getContent());
        } catch (Exception e) {
            log.warn("私人 Wiki 沉淀失败: {}", e.getMessage());
            res.put("code", 500);
            res.put("msg", "AI 提炼失败，请稍后再试");
        }
        return res;
    }

    /** 我的私人条目列表：GET /api/wiki/mine */
    @GetMapping("/mine")
    public Map<String, Object> mine() {
        Map<String, Object> res = new HashMap<>();
        Long userId = jwtAuth.getCurrentUserId();
        List<WikiKnowledge> rows = wikiKnowledgeService.listByUser(userId);
        List<Map<String, Object>> data = new ArrayList<>();
        for (WikiKnowledge k : rows) {
            Map<String, Object> m = new HashMap<>();
            m.put("id", k.getId());
            m.put("knowledgeType", k.getKnowledgeType());
            m.put("title", k.getTitle());
            m.put("content", k.getContent());
            m.put("exampleSentence", k.getExampleSentence());
            m.put("level", k.getLevel());
            m.put("createdAt", k.getCreatedAt());
            data.add(m);
        }
        res.put("code", 200);
        res.put("data", data);
        return res;
    }

    /** 删除我的私人条目：DELETE /api/wiki/mine/{id}（只允许删自己的） */
    @DeleteMapping("/mine/{id}")
    public Map<String, Object> remove(@PathVariable Long id) {
        Map<String, Object> res = new HashMap<>();
        Long userId = jwtAuth.getCurrentUserId();
        WikiKnowledge row = wikiKnowledgeService.getById(id);
        if (row == null || row.getUserId() == null || !row.getUserId().equals(userId)) {
            res.put("code", 404);
            res.put("msg", "条目不存在");
            return res;
        }
        wikiKnowledgeService.removeById(id);
        res.put("code", 200);
        return res;
    }

    private Long safeUserId() {
        try { return jwtAuth.getCurrentUserId(); } catch (Exception e) { return null; }
    }

    private int safeType(Object v) {
        try {
            int t = Integer.parseInt(String.valueOf(v));
            return t >= 1 && t <= 4 ? t : 3;
        } catch (Exception e) { return 3; }
    }

    private int safeLevel(Object v) {
        try {
            int l = Integer.parseInt(String.valueOf(v));
            return l >= 1 && l <= 5 ? l : 3;
        } catch (Exception e) { return 3; }
    }
}
