package com.example.backend.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.example.backend.config.StarMapPrompt;
import com.example.backend.entity.GenerateTask;
import com.example.backend.entity.StarmapAiPoint;
import com.example.backend.entity.StarmapPoint;
import com.example.backend.entity.TaskManager;
import com.example.backend.entity.UserWrongQuestion;
import com.example.backend.mapper.StarmapAiPointMapper;
import com.example.backend.mapper.StarmapPointMapper;
import com.example.backend.mapper.UserWrongQuestionMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;

/**
 * 把错题交给 AI 反推知识点。
 * 一次一批（默认 15 题）、单题一次调用、单题失败不影响整批：
 * 失败也要落一行占位，否则下次又会被挑出来重跑，白烧额度。
 */
@Service
public class StarMapAiService {

    private static final Logger log = LoggerFactory.getLogger(StarMapAiService.class);
    private static final ObjectMapper mapper = new ObjectMapper();
    /** 单次批量上限：现在每个点要多写约100字讲解，降到10题控制单批 token */
    public static final int MAX_PER_RUN = 10;
    /** 喂给 AI 的已有知识点标题白名单长度上限（它是最大的 token 项） */
    private static final int WHITELIST_MAX = 200;
    /** 连续失败多少题就中止整批（多半是额度或网络，继续跑只会浪费） */
    private static final int ABORT_AFTER_CONSECUTIVE_FAILURES = 3;

    @Autowired
    private QuestionService questionService;

    @Autowired(required = false)
    private UserWrongQuestionMapper wrongQuestionMapper;
    @Autowired(required = false)
    private StarmapAiPointMapper aiPointMapper;
    @Autowired(required = false)
    private StarmapPointMapper pointMapper;
    @Autowired
    private TaskManager taskManager;

    /** 挑还没反推过的错题：starmap_ai_point 里没有任何行 = 没烧过 token */
    public List<UserWrongQuestion> pickUnanalyzed(Long userId, boolean retryFailed) {
        return pickUnanalyzed(userId, retryFailed, MAX_PER_RUN);
    }

    /** 给"人工勾选错题"用：最多返回 limit 条未反推的题 */
    public List<UserWrongQuestion> pickUnanalyzed(Long userId, boolean retryFailed, int limit) {
        if (wrongQuestionMapper == null || userId == null) return List.of();
        List<UserWrongQuestion> all = wrongQuestionMapper.selectList(
            new LambdaQueryWrapper<UserWrongQuestion>()
                .eq(UserWrongQuestion::getUserId, userId)
                .eq(UserWrongQuestion::getIsRemoved, 0)
                .orderByDesc(UserWrongQuestion::getId));
        Set<Long> handled = handledQuestionIds(userId, retryFailed);
        List<UserWrongQuestion> out = new ArrayList<>();
        int cap = Math.max(1, limit);
        for (UserWrongQuestion wq : all) {
            if (handled.contains(wq.getId())) continue;
            out.add(wq);
            if (out.size() >= cap) break;
        }
        return out;
    }

    /** 用户手选错题：只接受自己的、未删除、未反推过的，顺序按用户传入顺序，最多 10 条 */
    public List<UserWrongQuestion> pickSelected(Long userId, List<Long> ids) {
        if (wrongQuestionMapper == null || userId == null || ids == null || ids.isEmpty()) return List.of();
        List<Long> wanted = ids.stream().filter(Objects::nonNull).distinct().limit(MAX_PER_RUN).toList();
        if (wanted.isEmpty()) return List.of();
        List<UserWrongQuestion> owned = wrongQuestionMapper.selectList(
            new LambdaQueryWrapper<UserWrongQuestion>()
                .eq(UserWrongQuestion::getUserId, userId)
                .eq(UserWrongQuestion::getIsRemoved, 0)
                .in(UserWrongQuestion::getId, wanted));
        Map<Long, UserWrongQuestion> byId = new HashMap<>();
        for (UserWrongQuestion wq : owned) byId.put(wq.getId(), wq);
        Set<Long> handled = handledQuestionIds(userId, false);
        List<UserWrongQuestion> out = new ArrayList<>();
        for (Long id : wanted) {
            UserWrongQuestion wq = byId.get(id);
            if (wq != null && !handled.contains(id)) out.add(wq);
        }
        return out;
    }

    public long unanalyzedCount(Long userId, boolean includeFailed) {
        if (wrongQuestionMapper == null || userId == null) return 0;
        Set<Long> handled = handledQuestionIds(userId, !includeFailed);
        return wrongQuestionMapper.selectList(
                new LambdaQueryWrapper<UserWrongQuestion>()
                    .eq(UserWrongQuestion::getUserId, userId)
                    .eq(UserWrongQuestion::getIsRemoved, 0))
            .stream().filter(wq -> !handled.contains(wq.getId())).count();
    }

    public long failedCount(Long userId) {
        if (aiPointMapper == null || userId == null) return 0;
        return aiPointMapper.selectCount(new LambdaQueryWrapper<StarmapAiPoint>()
            .eq(StarmapAiPoint::getUserId, userId)
            .eq(StarmapAiPoint::getStatus, "failed"));
    }

    /**
     * @param retryFailed true 时把只失败过的题也重新挑出来（用户点"重试失败题"）
     */
    private Set<Long> handledQuestionIds(Long userId, boolean retryFailed) {
        if (aiPointMapper == null) return Set.of();
        LambdaQueryWrapper<StarmapAiPoint> q = new LambdaQueryWrapper<StarmapAiPoint>()
            .eq(StarmapAiPoint::getUserId, userId);
        if (retryFailed) q.ne(StarmapAiPoint::getStatus, "failed");
        Set<Long> ids = new HashSet<>();
        for (StarmapAiPoint row : aiPointMapper.selectList(q)) ids.add(row.getWrongQuestionId());
        return ids;
    }

    private List<String> existingTitles(Long userId) {
        if (pointMapper == null) return List.of();
        List<StarmapPoint> list = pointMapper.selectList(new LambdaQueryWrapper<StarmapPoint>()
            .eq(StarmapPoint::getUserId, userId)
            .orderByDesc(StarmapPoint::getId)
            .last("limit " + WHITELIST_MAX));
        return list.stream().map(StarmapPoint::getTitle).toList();
    }

    @Async("generateExecutor")
    public void analyze(String taskId, Long userId, List<UserWrongQuestion> queue) {
        GenerateTask task = taskManager.getTask(taskId);
        if (task == null) return;
        task.setStatus(GenerateTask.Status.RUNNING);
        List<String> whitelist = new ArrayList<>(existingTitles(userId));
        int done = 0;
        int failed = 0;
        int candidates = 0;
        int consecutiveFailures = 0;

        for (UserWrongQuestion wq : queue) {
            if (task.getStatus() == GenerateTask.Status.FAILED) break;
            try {
                Map<String, Object> q = parseQuestion(wq.getQuestionContent());
                List<Map<String, Object>> points = callOnce(userId, wq, q, whitelist);
                if (points.isEmpty()) {
                    saveFailed(userId, wq.getId(), "AI 没给出知识点");
                    failed++;
                    consecutiveFailures++;
                } else {
                    candidates += saveCandidates(userId, wq.getId(), points, whitelist);
                    whitelist.addAll(points.stream().map(p -> String.valueOf(p.get("title"))).toList());
                    consecutiveFailures = 0;
                }
            } catch (Exception e) {
                log.warn("星图反推失败 question={}: {}", wq.getId(), e.getMessage());
                saveFailed(userId, wq.getId(), e.getMessage());
                failed++;
                consecutiveFailures++;
            }
            done++;
            task.setResult(progress(done, queue.size(), failed, candidates));
            if (consecutiveFailures >= ABORT_AFTER_CONSECUTIVE_FAILURES) {
                task.setStatus(GenerateTask.Status.FAILED);
                task.setErrorMessage("AI 服务连续 " + consecutiveFailures + " 题失败，已中止本批（可能是额度或网络问题）");
            }
        }

        if (task.getStatus() != GenerateTask.Status.FAILED) {
            task.setStatus(GenerateTask.Status.COMPLETED);
        }
        task.setResult(progress(done, queue.size(), failed, candidates));
        task.setCompletedAt(java.time.LocalDateTime.now());
    }

    private Map<String, Object> progress(int done, int total, int failed, int candidates) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("done", done);
        m.put("total", total);
        m.put("failed", failed);
        m.put("candidates", candidates);
        return m;
    }

    private List<Map<String, Object>> callOnce(Long userId, UserWrongQuestion wq, Map<String, Object> q, List<String> whitelist) {
        Map<String, String> prompts = StarMapPrompt.buildPointPrompt(
            String.valueOf(q.getOrDefault("question", wq.getQuestionId())),
            optionsText(q.get("options")),
            wq.getUserAnswer(),
            wq.getCorrectAnswer() != null ? wq.getCorrectAnswer() : String.valueOf(q.getOrDefault("answer", "")),
            wq.getExplanation() != null ? wq.getExplanation() : String.valueOf(q.getOrDefault("explanation", "")),
            wq.getErrorTypes(),
            wq.getErrorNote(),
            whitelist.size() > WHITELIST_MAX ? whitelist.subList(0, WHITELIST_MAX) : whitelist);
        String raw = questionService.callAIContent(prompts.get("system"), prompts.get("user"));
        return parsePoints(raw);
    }

    private int saveCandidates(Long userId, Long questionId, List<Map<String, Object>> points, List<String> whitelist) {
        if (aiPointMapper == null) return 0;
        int saved = 0;
        Set<String> seen = new HashSet<>();
        for (Map<String, Object> p : points) {
            String title = String.valueOf(p.getOrDefault("title", "")).trim();
            String key = StarMapSupport.normalizeTitle(title);
            if (title.isEmpty() || key.isEmpty() || !seen.add(key) || isMetaTitle(title)) continue;
            Object rawNote = p.containsKey("note") ? p.get("note") : p.get("why");
            String note = rawNote == null ? "" : String.valueOf(rawNote).trim();
            StarmapAiPoint row = new StarmapAiPoint();
            row.setUserId(userId);
            row.setWrongQuestionId(questionId);
            row.setTitle(title.length() > 120 ? title.substring(0, 120) : title);
            row.setTitleKey(key.length() > 120 ? key.substring(0, 120) : key);
            row.setReason(cut(note, 300));
            row.setConf(toConf(p.get("conf")));
            row.setStatus("pending");
            aiPointMapper.insert(row);
            saved++;
            if (saved >= 5) break;
        }
        return saved;
    }

    /** 展示账号/界面文案不是学科知识点，别让它们混进候选 */
    public static boolean isMetaTitle(String title) {
        String t = title == null ? "" : title.trim();
        return t.contains("展示账号") || t.contains("账号识别") || t.contains("测试账号");
    }

    private void saveFailed(Long userId, Long questionId, String why) {
        if (aiPointMapper == null) return;
        StarmapAiPoint row = new StarmapAiPoint();
        row.setUserId(userId);
        row.setWrongQuestionId(questionId);
        row.setTitle("");
        row.setTitleKey("");
        row.setStatus("failed");
        row.setError(cut(why, 200));
        aiPointMapper.insert(row);
    }

    // ============================ JSON 解析 ============================

    /** 与 QuestionService 的截断恢复同构，但形状是 {points:[...]}，不共用它的私有方法 */
    static List<Map<String, Object>> parsePoints(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        String json = raw.replace("```json", "").replace("```", "").trim();
        int start = json.indexOf('{');
        int end = json.lastIndexOf('}');
        if (start >= 0 && end > start) json = json.substring(start, end + 1);
        List<Map<String, Object>> fromWhole = readPoints(json);
        if (fromWhole != null && !fromWhole.isEmpty()) return fromWhole;
        // 截断兜底：补齐右括号再试一次
        for (String closer : new String[]{"}]}", "}}", "}"}) {
            List<Map<String, Object>> retry = readPoints(json + closer);
            if (retry != null && !retry.isEmpty()) return retry;
        }
        // 最后按大括号深度扫完整对象，留下带 title 的
        List<Map<String, Object>> out = new ArrayList<>();
        int depth = 0;
        int from = -1;
        for (int i = 0; i < json.length() && out.size() < 5; i++) {
            char c = json.charAt(i);
            if (c == '{') { if (depth == 0) from = i; depth++; }
            else if (c == '}') {
                depth--;
                if (depth == 0 && from >= 0) {
                    try {
                        Map<String, Object> one = mapper.readValue(json.substring(from, i + 1), new TypeReference<>() {});
                        if (one.get("title") != null) out.add(one);
                    } catch (Exception ignored) { }
                    from = -1;
                }
            }
        }
        return out;
    }

    private static List<Map<String, Object>> readPoints(String json) {
        try {
            Map<String, Object> parsed = mapper.readValue(json, new TypeReference<>() {});
            Object list = parsed.get("points");
            if (list instanceof List<?> rows) {
                List<Map<String, Object>> out = new ArrayList<>();
                for (Object row : rows) if (row instanceof Map<?, ?> m) {
                    @SuppressWarnings("unchecked") Map<String, Object> cast = (Map<String, Object>) m;
                    out.add(cast);
                }
                return out;
            }
        } catch (Exception ignored) { }
        return null;
    }

    private Map<String, Object> parseQuestion(String content) {
        if (content == null || content.isBlank()) return Map.of();
        try {
            return mapper.readValue(content, new TypeReference<>() {});
        } catch (Exception e) {
            return Map.of("question", content);
        }
    }

    private String optionsText(Object options) {
        if (!(options instanceof Map<?, ?> map)) return options == null ? "" : String.valueOf(options);
        StringBuilder sb = new StringBuilder();
        map.forEach((k, v) -> sb.append(k).append('.').append(v).append("　"));
        return sb.toString();
    }

    private BigDecimal toConf(Object v) {
        double d;
        if (v instanceof Number n) d = n.doubleValue();
        else {
            try { d = Double.parseDouble(String.valueOf(v)); } catch (Exception e) { return null; }
        }
        if (d > 1) d = d / 100.0;
        return BigDecimal.valueOf(Math.max(0, Math.min(1, d))).setScale(2, RoundingMode.HALF_UP);
    }

    private static String cut(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }
}
