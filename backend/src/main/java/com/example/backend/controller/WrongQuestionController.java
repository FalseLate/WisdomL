package com.example.backend.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.example.backend.auth.JwtAuth;
import com.example.backend.entity.AnswerRecord;
import com.example.backend.entity.QuestionRecord;
import com.example.backend.entity.UserWrongQuestion;
import com.example.backend.mapper.AnswerRecordMapper;
import com.example.backend.mapper.QuestionRecordMapper;
import com.example.backend.mapper.UserWrongQuestionMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * 错题本 + PDCA 错题闭环（错因标注 / 查看订正 / 动手重做 / 简化SM-2复习调度 / 个人错因统计）
 * 接口前缀 /api/wrong-questions
 */
@RestController
@RequestMapping("/api")
public class WrongQuestionController {

    private static final Logger log = LoggerFactory.getLogger(WrongQuestionController.class);
    private static final ObjectMapper mapper = new ObjectMapper();

    /** 简化 SM-2 复习间隔（天）：第1次重做对→1天，第2次→3天，第3次→7天，第4次→掌握移出队列 */
    private static final int[] REVIEW_INTERVAL_DAYS = {1, 3, 7};
    /** 连续答对多少次视为已掌握（1/3/7 天后各复习一次，第4次答对掌握） */
    private static final int MASTER_STREAK = 4;
    /** 五大错因编码（与论文加涅五分类对应：审题/知识/数学/策略/习惯） */
    private static final String[] ERROR_TYPES = {"audit", "knowledge", "math", "strategy", "habit"};

    @Autowired(required = false)
    private UserWrongQuestionMapper wrongQuestionMapper;

    @Autowired(required = false)
    private AnswerRecordMapper answerRecordMapper;

    @Autowired(required = false)
    private QuestionRecordMapper questionRecordMapper;

    @Autowired(required = false)
    private JwtAuth jwtAuth;

    @Value("${ai.api.url}")
    private String aiUrl;
    @Value("${ai.api.key}")
    private String aiKey;
    @Value("${ai.model}")
    private String aiModel;
    private final RestTemplate restTemplate = new RestTemplate();

    // ============================ 错题列表 ============================

    @GetMapping("/wrong-questions")
    public List<Map<String, Object>> list() {
        if (wrongQuestionMapper == null) return List.of();
        Long userId = getCurrentUserId();
        return wrongQuestionMapper.selectList(
            new LambdaQueryWrapper<UserWrongQuestion>()
                .eq(UserWrongQuestion::getUserId, userId)
                .eq(UserWrongQuestion::getIsRemoved, 0)
                .orderByDesc(UserWrongQuestion::getUpdatedAt)
        ).stream().map(this::toMap).toList();
    }

    // ============================ 移除（软删除，不再物理删除） ============================

    @DeleteMapping("/wrong-questions/{id}")
    public Map<String, Object> remove(@PathVariable Long id) {
        if (wrongQuestionMapper != null) {
            UserWrongQuestion wq = wrongQuestionMapper.selectById(id);
            // 归属校验：只能软删自己的错题
            if (wq != null && Objects.equals(wq.getUserId(), getCurrentUserId())) {
                wq.setIsRemoved(1);
                wrongQuestionMapper.updateById(wq);
            }
        }
        return Map.of("success", true);
    }

    @GetMapping("/wrong-questions/count")
    public Map<String, Object> count() {
        Long userId = getCurrentUserId();
        long c = wrongQuestionMapper != null ?
            wrongQuestionMapper.selectCount(
                new LambdaQueryWrapper<UserWrongQuestion>()
                    .eq(UserWrongQuestion::getUserId, userId)
                    .eq(UserWrongQuestion::getIsRemoved, 0)) : 0;
        return Map.of("count", c);
    }

    // ============================ 步骤2(P)：错因标注（结果页逐题内联调用） ============================

    @PostMapping("/wrong-questions/error-type")
    public Map<String, Object> saveErrorType(@RequestBody Map<String, Object> body) {
        Map<String, Object> resp = new HashMap<>();
        if (wrongQuestionMapper == null) { resp.put("success", false); return resp; }
        Long userId = getCurrentUserId();
        String questionId = asStr(body.get("questionId"));
        String errorTypes = asStr(body.get("errorTypes"));
        String errorNote = asStr(body.get("errorNote"));
        if (questionId.isEmpty()) { resp.put("success", false); resp.put("error", "缺少questionId"); return resp; }

        UserWrongQuestion wq = wrongQuestionMapper.selectOne(
            new LambdaQueryWrapper<UserWrongQuestion>()
                .eq(UserWrongQuestion::getUserId, userId)
                .eq(UserWrongQuestion::getQuestionId, questionId)
                .eq(UserWrongQuestion::getIsRemoved, 0)
                .orderByDesc(UserWrongQuestion::getId).last("LIMIT 1"));
        if (wq == null) { resp.put("success", false); resp.put("error", "错题不存在"); return resp; }

        wq.setErrorTypes(errorTypes.isEmpty() ? null : errorTypes);
        wq.setErrorNote(errorNote.isEmpty() ? null : errorNote);
        wrongQuestionMapper.updateById(wq);
        resp.put("success", true);
        return resp;
    }

    // ============================ 步骤3(D)：查看订正（只看解析，标记未完成复习） ============================

    // 只读：按题目业务ID查询当前用户已保存错因/反思，供前端刷新后回显（不修改任何数据）
    @GetMapping("/wrong-questions/error-type/{questionId}")
    public Map<String, Object> getErrorType(@PathVariable String questionId) {
        Map<String, Object> resp = new HashMap<>();
        resp.put("errorTypes", "");
        resp.put("errorNote", "");
        if (wrongQuestionMapper == null) return resp;
        Long userId = getCurrentUserId();
        UserWrongQuestion wq = wrongQuestionMapper.selectOne(
            new LambdaQueryWrapper<UserWrongQuestion>()
                .eq(UserWrongQuestion::getUserId, userId)
                .eq(UserWrongQuestion::getQuestionId, questionId)
                .eq(UserWrongQuestion::getIsRemoved, 0)
                .orderByDesc(UserWrongQuestion::getId).last("LIMIT 1"));
        if (wq != null) {
            resp.put("errorTypes", wq.getErrorTypes() != null ? wq.getErrorTypes() : "");
            resp.put("errorNote", wq.getErrorNote() != null ? wq.getErrorNote() : "");
        }
        return resp;
    }

    @PostMapping("/wrong-questions/{id}/view")
    public Map<String, Object> markViewed(@PathVariable Long id) {
        Map<String, Object> resp = new HashMap<>();
        UserWrongQuestion wq = owned(id);
        if (wq == null) { resp.put("success", false); return resp; }
        // 0未订正 → 1看过解析未重做；已进入重做流程(≥2)的不再回退
        if (nv(wq.getStatus()) == 0) {
            wq.setStatus(1);
            wrongQuestionMapper.updateById(wq);
        }
        resp.put("success", true);
        resp.put("status", nv(wq.getStatus()));
        return resp;
    }

    // ============================ 步骤3(D)+步骤6(A)：动手重做（判分 + 状态机 + 简化SM-2） ============================

    @PostMapping("/wrong-questions/{id}/redo")
    public Map<String, Object> redo(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        Map<String, Object> resp = new HashMap<>();
        UserWrongQuestion wq = owned(id);
        if (wq == null) { resp.put("success", false); resp.put("error", "错题不存在"); return resp; }

        String userAnswer = asStr(body.get("userAnswer"));
        Integer answerTime = body.get("answerTime") instanceof Number n ? n.intValue() : null;
        // 主观题：前端点了AI评价后把分数(0-5)带回来；没评价则为 null，只保存答案、不推进状态机
        Integer score = body.get("score") instanceof Number s ? s.intValue() : null;
        boolean subjective = "subjective".equals(wq.getQuestionType());

        wq.setUserAnswer(userAnswer);
        if (answerTime != null) wq.setAnswerTime(answerTime);

        Boolean correct = null; // null=本次无法判定（主观题未AI评价）
        if (subjective) {
            if (score != null) {
                wq.setScore(score);
                correct = score >= 3;
            }
        } else {
            // 以题面 questionContent 里的 answer 为判分基准（与前端选项标绿同源），correctAnswer 列兜底
            correct = normalizeAnswer(userAnswer).equals(normalizeAnswer(referenceAnswer(wq)));
        }

        LocalDateTime now = LocalDateTime.now();
        if (correct == null) {
            // 主观题只保存作答，等用户点“AI评价”后带 score 再次提交推进状态
            wrongQuestionMapper.updateById(wq);
            resp.put("success", true);
            resp.put("needEval", true);
            resp.put("status", nv(wq.getStatus()));
            return resp;
        }

        if (correct) {
            int prevStreak = nv(wq.getCorrectStreak());
            LocalDateTime lockedUntil = wq.getNextReviewTime();
            // 到期闸门：之前已答对过(连对≥1)且还没到安排时间 → 不推进连对次数，防止连刷秒掌握（当天可看解析/保存答案）
            if (prevStreak >= 1 && lockedUntil != null && now.isBefore(lockedUntil)) {
                wrongQuestionMapper.updateById(wq);
                resp.put("success", true);
                resp.put("notTime", true);
                resp.put("correct", true);
                resp.put("status", nv(wq.getStatus()));
                resp.put("correctStreak", prevStreak);
                resp.put("lockedUntil", lockedUntil.toString());
                return resp;
            }
            int streak = prevStreak + 1;
            wq.setCorrectStreak(streak);
            wq.setReviewCount(nv(wq.getReviewCount()) + 1);
            wq.setLastReviewTime(now);
            if (streak >= MASTER_STREAK) {
                wq.setStatus(3);                 // 第4次答对 → 已掌握，移出复习队列
                wq.setNextReviewTime(null);
            } else {
                wq.setStatus(2);                 // 复习中：1天→3天→7天
                int idx = Math.min(streak - 1, REVIEW_INTERVAL_DAYS.length - 1);
                wq.setNextReviewTime(now.plusDays(REVIEW_INTERVAL_DAYS[idx]));
            }
        } else {
            // 答错：连对清零、错误次数+1、回到未订正；next 设为当前 → 当天即可再次重做
            wq.setCorrectStreak(0);
            wq.setWrongCount(nv(wq.getWrongCount()) + 1);
            wq.setReviewCount(nv(wq.getReviewCount()) + 1);
            wq.setLastReviewTime(now);
            wq.setStatus(0);
            wq.setNextReviewTime(now);
        }
        wrongQuestionMapper.updateById(wq);

        resp.put("success", true);
        resp.put("correct", correct);
        resp.put("status", nv(wq.getStatus()));
        resp.put("correctStreak", nv(wq.getCorrectStreak()));
        resp.put("reviewCount", nv(wq.getReviewCount()));
        resp.put("nextReviewTime", wq.getNextReviewTime() != null ? wq.getNextReviewTime().toString() : null);
        return resp;
    }

    /** 取判分基准答案：优先题面 questionContent.answer（与前端显示同源），回退落库的 correctAnswer 列 */
    private String referenceAnswer(UserWrongQuestion wq) {
        try {
            if (wq.getQuestionContent() != null) {
                Map<String, Object> q = mapper.readValue(wq.getQuestionContent(),
                        new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
                Object a = q == null ? null : q.get("answer");
                if (a != null && !asStr(a).isEmpty()) return asStr(a);
            }
        } catch (Exception ignore) { /* 题面损坏时回退 */ }
        return wq.getCorrectAnswer();
    }

    // ============================ 步骤3：主观重做的 AI 评价（只评分，不落库、不改状态，避免重复计错） ============================

    @PostMapping("/wrong-questions/eval-subjective")
    public Map<String, Object> evalSubjective(@RequestBody Map<String, Object> body) {
        Map<String, Object> resp = new HashMap<>();
        Object qObj = body.get("question");
        if (!(qObj instanceof Map)) { resp.put("error", "题目缺失"); return resp; }
        Map<String, Object> question = (Map<String, Object>) qObj;
        String userAnswer = asStr(body.get("userAnswer"));
        if (userAnswer.isEmpty()) { resp.put("error", "请先作答"); return resp; }
        Map<String, Object> ev = callAi(userAnswer, asStr(question.get("answer")), asStr(question.get("explanation")));
        resp.put("score", ev.get("score") instanceof Number n ? n.intValue() : 0);
        resp.put("evaluation", asStr(ev.get("evaluation")));
        return resp;
    }

    // ============================ 步骤6：今日复习队列 ============================

    @GetMapping("/wrong-questions/review-today")
    public Map<String, Object> reviewToday() {
        Map<String, Object> resp = new HashMap<>();
        if (wrongQuestionMapper == null) { resp.put("count", 0); resp.put("list", List.of()); return resp; }
        Long userId = getCurrentUserId();
        LocalDateTime now = LocalDateTime.now();
        // status<3 未掌握；next_review_time 为空(新错题/未安排) 或 已到期 都进队列
        List<UserWrongQuestion> data = wrongQuestionMapper.selectList(
            new LambdaQueryWrapper<UserWrongQuestion>()
                .eq(UserWrongQuestion::getUserId, userId)
                .eq(UserWrongQuestion::getIsRemoved, 0)
                .lt(UserWrongQuestion::getStatus, 3)
                .and(w -> w.isNull(UserWrongQuestion::getNextReviewTime)
                          .or().le(UserWrongQuestion::getNextReviewTime, now))
                .orderByAsc(UserWrongQuestion::getNextReviewTime));
        List<Map<String, Object>> list = data.stream().map(this::toMap).toList();
        resp.put("count", list.size());
        resp.put("list", list);
        return resp;
    }

    // ============================ 步骤5(Check)：个人错因统计 ============================

    @GetMapping("/wrong-questions/stats")
    public Map<String, Object> stats() {
        Map<String, Object> resp = new HashMap<>();
        Long userId = getCurrentUserId();

        List<UserWrongQuestion> wrongs = wrongQuestionMapper != null ? wrongQuestionMapper.selectList(
            new LambdaQueryWrapper<UserWrongQuestion>()
                .eq(UserWrongQuestion::getUserId, userId)
                .eq(UserWrongQuestion::getIsRemoved, 0)) : List.of();

        // 1) 五大错因标签分布（可多选，统计的是“标签次数”）
        Map<String, Integer> errorTypeDist = new LinkedHashMap<>();
        for (String t : ERROR_TYPES) errorTypeDist.put(t, 0);
        for (UserWrongQuestion w : wrongs) {
            if (w.getErrorTypes() == null || w.getErrorTypes().isBlank()) continue;
            for (String t : w.getErrorTypes().split(",")) {
                String key = t.trim();
                if (errorTypeDist.containsKey(key)) errorTypeDist.put(key, errorTypeDist.get(key) + 1);
            }
        }
        resp.put("errorTypeDist", errorTypeDist);

        // 2) 慢题占比
        long slowCount = wrongs.stream().filter(w -> nv(w.getIsSlow()) == 1).count();
        Map<String, Object> slow = new HashMap<>();
        slow.put("slowCount", slowCount);
        slow.put("total", wrongs.size());
        slow.put("ratio", wrongs.isEmpty() ? 0 : Math.round(slowCount * 1000.0 / wrongs.size()) / 10.0);
        resp.put("slow", slow);

        // 3) 掌握状态分布 + 重做正确率（口径：至少重做过1次的题中，当前处于复习中/已掌握的占比）
        int s0 = 0, s1 = 0, s2 = 0, s3 = 0, reviewed = 0, reviewOk = 0;
        for (UserWrongQuestion w : wrongs) {
            switch (nv(w.getStatus())) {
                case 1 -> s1++;
                case 2 -> { s2++; reviewed++; reviewOk++; }
                case 3 -> { s3++; reviewed++; reviewOk++; }
                default -> s0++;
            }
        }
        Map<String, Object> statusDist = new LinkedHashMap<>();
        statusDist.put("unfixed", s0); statusDist.put("viewed", s1);
        statusDist.put("reviewing", s2); statusDist.put("mastered", s3);
        resp.put("statusDist", statusDist);
        resp.put("redoCorrectRate", reviewed == 0 ? 0 : Math.round(reviewOk * 1000.0 / reviewed) / 10.0);

        // 4) 近7天每日新增错题趋势（按创建日期，缺日补0）
        Map<String, Integer> trend = new LinkedHashMap<>();
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("MM-dd");
        LocalDate today = LocalDate.now();
        for (int i = 6; i >= 0; i--) trend.put(today.minusDays(i).format(fmt), 0);
        for (UserWrongQuestion w : wrongs) {
            if (w.getCreatedAt() == null) continue;
            LocalDate d = w.getCreatedAt().toLocalDate();
            if (!d.isBefore(today.minusDays(6)) && !d.isAfter(today)) {
                String key = d.format(fmt);
                trend.merge(key, 1, Integer::sum);
            }
        }
        resp.put("trend7", trend);

        // 5) 各题型错误率：分母来自答题记录（answer_record 通过 question_record 归属当前用户）
        Map<String, int[]> byTypeArr = new HashMap<>(); // type -> [total, correct]
        if (answerRecordMapper != null && questionRecordMapper != null) {
            List<Long> recIds = questionRecordMapper.selectList(
                new LambdaQueryWrapper<QuestionRecord>().eq(QuestionRecord::getUserId, userId)
            ).stream().map(QuestionRecord::getId).toList();
            if (!recIds.isEmpty()) {
                List<AnswerRecord> records = answerRecordMapper.selectList(
                    new LambdaQueryWrapper<AnswerRecord>().in(AnswerRecord::getRecordId, recIds));
                for (AnswerRecord ar : records) {
                    String type = ar.getQuestionType() == null ? "unknown" : ar.getQuestionType();
                    int[] tc = byTypeArr.computeIfAbsent(type, k -> new int[2]);
                    tc[0]++;
                    if (nv(ar.getIsCorrect()) == 1) tc[1]++;
                }
            }
        }
        Map<String, Object> byType = new LinkedHashMap<>();
        for (Map.Entry<String, int[]> e : byTypeArr.entrySet()) {
            int total = e.getValue()[0], correct = e.getValue()[1];
            Map<String, Object> one = new HashMap<>();
            one.put("total", total);
            one.put("wrong", total - correct);
            one.put("rate", total == 0 ? 0 : Math.round((total - correct) * 1000.0 / total) / 10.0);
            byType.put(e.getKey(), one);
        }
        resp.put("byType", byType);
        resp.put("totalWrong", wrongs.size());
        return resp;
    }

    // ============================ 私有工具 ============================

    /** 按主键取本人错题，非本人/不存在返回 null */
    private UserWrongQuestion owned(Long id) {
        if (wrongQuestionMapper == null) return null;
        UserWrongQuestion wq = wrongQuestionMapper.selectById(id);
        if (wq == null || !Objects.equals(wq.getUserId(), getCurrentUserId())) return null;
        return wq;
    }

    private Map<String, Object> toMap(UserWrongQuestion wq) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", wq.getId());
        m.put("questionId", wq.getQuestionId());
        m.put("questionContent", wq.getQuestionContent());
        m.put("questionType", wq.getQuestionType());
        m.put("userAnswer", wq.getUserAnswer());
        m.put("correctAnswer", wq.getCorrectAnswer());
        m.put("explanation", wq.getExplanation());
        m.put("score", wq.getScore());
        m.put("wrongCount", wq.getWrongCount());
        m.put("errorTypes", wq.getErrorTypes());
        m.put("errorNote", wq.getErrorNote());
        m.put("isSlow", wq.getIsSlow());
        m.put("answerTime", wq.getAnswerTime());
        m.put("status", wq.getStatus());
        m.put("reviewCount", wq.getReviewCount());
        m.put("correctStreak", wq.getCorrectStreak());
        m.put("lastReviewTime", wq.getLastReviewTime() != null ? wq.getLastReviewTime().toString() : null);
        m.put("nextReviewTime", wq.getNextReviewTime() != null ? wq.getNextReviewTime().toString() : null);
        m.put("knowledgePoints", wq.getKnowledgePoints());
        m.put("createdAt", wq.getCreatedAt() != null ? wq.getCreatedAt().toString() : null);
        return m;
    }

    /** 主观题 AI 评分（与 AnswerController 同模型同提示词，但此处只评分、不落错题库） */
    private Map<String, Object> callAi(String userAnswer, String referenceAnswer, String explanation) {
        Map<String, Object> fallback = new HashMap<>();
        fallback.put("evaluation", "AI 评价暂时不可用，请对照参考答案自评。");
        fallback.put("score", 0);
        try {
            Map<String, Object> body = new HashMap<>();
            body.put("model", aiModel);
            body.put("temperature", 0.7);
            body.put("max_tokens", 1024);
            String systemPrompt = "你是一位专业的阅卷老师，请对学生的主观题答案进行评分和评价。";
            String userPrompt = String.format(
                    "学生答案：%s\n\n参考答案：%s\n\n答题思路：%s\n\n请对学生的答案进行评分（1-5分，5分满分）和评价。评价要简洁明了，控制在200字以内。\n\n请严格以JSON格式返回：{\"score\":分数,\"evaluation\":\"评价内容\"}",
                    userAnswer, referenceAnswer, explanation);
            body.put("messages", List.of(
                    Map.of("role", "system", "content", systemPrompt),
                    Map.of("role", "user", "content", userPrompt)));
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(aiKey);
            ResponseEntity<Map> response = restTemplate.exchange(
                    aiUrl, HttpMethod.POST, new HttpEntity<>(body, headers), Map.class);
            String content = "";
            if (response.getBody() != null && response.getBody().containsKey("choices")) {
                List<Map<String, Object>> choices = (List<Map<String, Object>>) response.getBody().get("choices");
                if (choices != null && !choices.isEmpty()) {
                    Map<String, Object> message = (Map<String, Object>) choices.get(0).get("message");
                    if (message != null && message.get("content") instanceof String s) content = s;
                }
            }
            if (content.isEmpty()) return fallback;
            String cleaned = content.replace("```json", "").replace("```", "").trim();
            int st = cleaned.indexOf('{'), en = cleaned.lastIndexOf('}');
            if (st >= 0 && en > st) cleaned = cleaned.substring(st, en + 1);
            Map<String, Object> parsed = mapper.readValue(cleaned,
                    new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
            Map<String, Object> r = new HashMap<>();
            Object scoreObj = parsed.get("score");
            int score = 0;
            if (scoreObj instanceof Number) score = ((Number) scoreObj).intValue();
            else if (scoreObj instanceof String ss) { try { score = Integer.parseInt(ss); } catch (Exception ignore) {} }
            r.put("score", Math.max(0, Math.min(5, score)));
            r.put("evaluation", parsed.getOrDefault("evaluation", ""));
            return r;
        } catch (Exception e) {
            log.error("重做主观题AI评价失败：{}", e.getMessage());
            return fallback;
        }
    }

    /** 与 AnswerController.normalizeAnswer 同一口径：提取 A-E 去重排序，兼容脏格式与判断题中文 */
    private String normalizeAnswer(String answer) {
        if (answer == null) return "";
        String s = answer.trim();
        if (s.isEmpty()) return "";
        java.util.TreeSet<Character> letters = new java.util.TreeSet<>();
        for (char c : s.toCharArray()) {
            if ((c >= 'A' && c <= 'E') || (c >= 'a' && c <= 'e')) letters.add(Character.toUpperCase(c));
        }
        if (!letters.isEmpty()) {
            StringBuilder sb = new StringBuilder();
            for (Character c : letters) sb.append(c);
            return sb.toString();
        }
        String low = s.toLowerCase();
        if (s.contains("错") || s.contains("不") || s.contains("非") || s.contains("否")
                || s.contains("×") || s.contains("✗") || low.equals("f") || low.equals("false") || low.equals("no")) {
            return "B";
        }
        if (s.contains("正确") || s.contains("对") || s.contains("是") || s.contains("√") || s.contains("✓")
                || low.equals("t") || low.equals("true") || low.equals("yes")) {
            return "A";
        }
        String normalized = s.replaceAll("[\\s,，、.。:：;；()（）]+", "").toUpperCase();
        char[] chars = normalized.toCharArray();
        Arrays.sort(chars);
        return new String(chars);
    }

    private int nv(Integer v) { return v == null ? 0 : v; }

    private String asStr(Object o) { return o == null ? "" : String.valueOf(o).trim(); }

    private Long getCurrentUserId() {
        if (jwtAuth == null) throw new RuntimeException("未登录");
        return jwtAuth.getCurrentUserId();
    }
}
