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
        // 用户在复习页勾选的错因（逗号分隔 1-5），据此定向提炼笔记
        String errorTypeIds = body.get("errorTypeIds");
        if (errorTypeIds == null || errorTypeIds.isBlank()) {
            res.put("code", 400);
            res.put("msg", "请先选择错因再提炼笔记");
            return res;
        }
        String errorTypeNames = errorTypeNames(errorTypeIds);
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
            // 提炼升级：从「通用知识点」改为「个人错误模式」——对比我的答案与正确答案，
            // 推断思维误区（干扰项迷惑手法 + 我的心理惯性），同标题按模式归并，私人库越用越准
            String sys = "你是英语错题分析教练。对比学生的答案和正确答案，推断他当时的思维误区，沉淀成一条可复用的个人错因笔记。"
                    + "只输出一个 JSON 对象，禁止多余文字，格式："
                    + "{\"knowledgeType\":数字,\"title\":\"错误模式短标题(20字内)\","
                    + "\"content\":\"中文写三部分：我的思维误区；这类题的触发特征（怎么一眼识别）；对策。2到4句话\","
                    + "\"exampleSentence\":\"1个能体现该考点或易混表达的英文例句\",\"level\":3}。"
                    + "knowledgeType 从这些里选：2=短语词块，3=语法点，4=阅读解题策略。"
                    + "title 要概括成这类错误的通用模式（不是这一道题本身），例如「同义改写误选原词复现项」「过度推断」，方便以后同类错题归并。"
                    + "重点分析为什么错（干扰项的迷惑手法、学生的思维惯性），而不是罗列正确知识点。"
                    + "笔记要紧扣学生自述的错因类别展开。";
            String user = "我从这道英语题做错了，我判断自己的错因是：" + errorTypeNames + "。\n"
                    + "请围绕这些错因提炼出我的错误模式：\n"
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
            item.setErrorTypeIds(errorTypeIds);   // 绑定用户勾选的错因
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

    /**
     * 手动新增/更新私人笔记：POST /api/wiki/note
     * {id?, noteType(1知识点2词汇3长难句4批注), title, content, exampleSentence?, tags?, links?[id...]}
     * 归属强制为当前用户；links v1 只允许指向本人其它笔记（私↔私）。
     */
    @PostMapping("/note")
    public Map<String, Object> saveNote(@RequestBody Map<String, Object> body) {
        Map<String, Object> res = new HashMap<>();
        Long userId = jwtAuth.getCurrentUserId();

        Integer noteType = body.get("noteType") == null ? null
                : Integer.parseInt(String.valueOf(body.get("noteType")));
        String title = str(body.get("title"));
        if (noteType == null || noteType < 1 || noteType > 4) {
            res.put("code", 400); res.put("msg", "笔记类型非法（1知识点2词汇3长难句4批注）"); return res;
        }
        if (title == null || title.isBlank()) {
            res.put("code", 400); res.put("msg", "标题不能为空"); return res;
        }

        WikiKnowledge item = new WikiKnowledge();
        item.setNoteType(noteType);
        item.setTitle(title.trim());
        item.setContent(str(body.get("content")));
        item.setExampleSentence(str(body.get("exampleSentence")));
        item.setTags(str(body.get("tags")));
        item.setLinks(normalizeLinks(body.get("links"), userId));
        item.setKnowledgeType(3);   // 归入语法/知识大类，保证被现有检索捞到（knowledge_type NOT NULL）

        Object idObj = body.get("id");
        if (idObj == null || String.valueOf(idObj).isBlank()) {
            item.setUserId(userId);
            res.put("code", 200);
            res.put("id", wikiKnowledgeService.insertNote(item));
        } else {
            long id = Long.parseLong(String.valueOf(idObj));
            if (wikiKnowledgeService.findOwned(id, userId) == null) {
                res.put("code", 404); res.put("msg", "笔记不存在或无权限"); return res;
            }
            item.setId(id);
            item.setUserId(userId);
            wikiKnowledgeService.updateNote(item);
            res.put("code", 200);
            res.put("id", id);
        }
        return res;
    }

    /** links（List 或 JSON 串）过滤为"属于本人"的合法 id，返回 JSON 数组串；无合法项返回 null */
    @SuppressWarnings("unchecked")
    private String normalizeLinks(Object linksObj, Long userId) {
        if (linksObj == null) return null;
        List<?> raw;
        if (linksObj instanceof List) {
            raw = (List<?>) linksObj;
        } else {
            try { raw = objectMapper.readValue(String.valueOf(linksObj), List.class); }
            catch (Exception e) { return null; }
        }
        List<Long> valid = new ArrayList<>();
        for (Object o : raw) {
            try {
                long lid = Long.parseLong(String.valueOf(o));
                if (!valid.contains(lid) && wikiKnowledgeService.findOwned(lid, userId) != null) valid.add(lid);
            } catch (Exception ignored) { }
        }
        if (valid.isEmpty()) return null;
        try { return objectMapper.writeValueAsString(valid); } catch (Exception e) { return null; }
    }

    private static String str(Object v) { return v == null ? null : String.valueOf(v); }

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
            m.put("noteType", k.getNoteType());           // 手动笔记子类型；AI沉淀/公共为 null
            m.put("title", k.getTitle());
            m.put("content", k.getContent());
            m.put("exampleSentence", k.getExampleSentence());
            m.put("tags", k.getTags());                   // 逗号分隔标签
            m.put("links", k.getLinks());                 // JSON 数组串 [id...]，前端自行解析
            m.put("errorTypeIds", k.getErrorTypeIds());
            m.put("level", k.getLevel());
            m.put("createdAt", k.getCreatedAt());
            data.add(m);
        }
        res.put("code", 200);
        res.put("data", data);
        return res;
    }

    /** 笔记详情（含正向链接 + 反向链接）：GET /api/wiki/note/{id}（仅本人笔记） */
    @GetMapping("/note/{id}")
    public Map<String, Object> noteDetail(@PathVariable Long id) {
        Map<String, Object> res = new HashMap<>();
        Long userId = jwtAuth.getCurrentUserId();
        WikiKnowledge self = wikiKnowledgeService.findOwned(id, userId);
        if (self == null) { res.put("code", 404); res.put("msg", "笔记不存在或无权限"); return res; }

        List<WikiKnowledge> mine = wikiKnowledgeService.listByUser(userId);
        Map<Long, WikiKnowledge> byId = new HashMap<>();
        for (WikiKnowledge k : mine) byId.put(k.getId(), k);

        // 正向：本条 links 指向的条目
        List<Map<String, Object>> out = new ArrayList<>();
        for (long lid : parseIds(self.getLinks())) {
            WikiKnowledge t = byId.get(lid);
            if (t != null) out.add(brief(t));
        }
        // 反向：我的其它笔记里 links 含本条 id 的
        List<Map<String, Object>> back = new ArrayList<>();
        for (WikiKnowledge k : mine) {
            if (k.getId().equals(id)) continue;
            if (parseIds(k.getLinks()).contains(id)) back.add(brief(k));
        }

        Map<String, Object> data = new HashMap<>();
        data.put("id", self.getId());
        data.put("noteType", self.getNoteType());
        data.put("title", self.getTitle());
        data.put("content", self.getContent());
        data.put("exampleSentence", self.getExampleSentence());
        data.put("tags", self.getTags());
        data.put("errorTypeIds", self.getErrorTypeIds());
        data.put("links", out);
        data.put("backlinks", back);
        res.put("code", 200);
        res.put("data", data);
        return res;
    }

    /** 解析 links JSON 数组串为 id 列表；空/坏返回空表 */
    private List<Long> parseIds(String linksJson) {
        List<Long> ids = new ArrayList<>();
        if (linksJson == null || linksJson.isBlank()) return ids;
        try {
            for (Object o : objectMapper.readValue(linksJson, List.class)) {
                try { ids.add(Long.parseLong(String.valueOf(o))); } catch (Exception ignored) { }
            }
        } catch (Exception ignored) { }
        return ids;
    }

    private Map<String, Object> brief(WikiKnowledge k) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", k.getId());
        m.put("title", k.getTitle());
        m.put("noteType", k.getNoteType());
        return m;
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

    /** 错因 id(1-5) 转中文名，逗号分隔 */
    private static final Map<Integer, String> ERROR_TYPE_NAMES = Map.of(
            1, "审题失误", 2, "知识点不会", 3, "解题策略不当", 4, "逻辑推理错误", 5, "粗心习惯");

    private String errorTypeNames(String ids) {
        List<String> names = new ArrayList<>();
        for (String s : ids.split(",")) {
            try {
                String n = ERROR_TYPE_NAMES.get(Integer.parseInt(s.trim()));
                if (n != null) names.add(n);
            } catch (Exception ignored) { }
        }
        return names.isEmpty() ? "未分类" : String.join("、", names);
    }
}
