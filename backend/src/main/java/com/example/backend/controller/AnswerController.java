package com.example.backend.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.example.backend.auth.JwtAuth;
import com.example.backend.entity.AnswerRecord;
import com.example.backend.entity.UserWrongQuestion;
import com.example.backend.mapper.AnswerRecordMapper;
import com.example.backend.mapper.UserWrongQuestionMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.util.*;
import java.util.concurrent.CompletableFuture;

@RestController
@RequestMapping("/api")
public class AnswerController {

    private static final Logger log = LoggerFactory.getLogger(AnswerController.class);
    private static final ObjectMapper mapper = new ObjectMapper();

    @Autowired(required = false)
    private AnswerRecordMapper answerRecordMapper;

    @Autowired(required = false)
    private UserWrongQuestionMapper wrongQuestionMapper;

    @Autowired(required = false)
    private JwtAuth jwtAuth;

    @Value("${ai.api.url}")
    private String aiUrl;

    @Value("${ai.api.key}")
    private String aiKey;

    @Value("${ai.model}")
    private String aiModel;

    private final RestTemplate restTemplate = new RestTemplate();

    @PostConstruct
    public void init() {
        var factory = new org.springframework.http.client.SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) java.time.Duration.ofSeconds(15).toMillis());
        factory.setReadTimeout((int) java.time.Duration.ofSeconds(90).toMillis());
        restTemplate.setRequestFactory(factory);
    }

    private static String asStr(Object o) { return o == null ? "" : String.valueOf(o); }

    @PostMapping("/check")
    public ResponseEntity<Map<String, Object>> checkAnswer(@RequestBody Map<String, Object> request) {
        Map<String, Object> result = new HashMap<>();
        Long userId = getCurrentUserId();

        String userAnswer = asStr(request.get("userAnswer"));
        if (userAnswer.isEmpty()) {
            result.put("error", "请先选择答案");
            return ResponseEntity.badRequest().body(result);
        }

        Map<String, Object> question = (Map<String, Object>) request.get("question");
        if (question == null) {
            return ResponseEntity.status(404).body(Map.of("error", "题目不存在"));
        }

        String correctAnswer = asStr(question.get("answer"));
        String explanation = asStr(question.get("explanation"));
        boolean correct = normalizeAnswer(userAnswer).equals(normalizeAnswer(correctAnswer));

        result.put("correct", correct);
        result.put("correctAnswer", correctAnswer);
        result.put("explanation", explanation.isEmpty() ? "" : explanation);
        result.put("userAnswer", userAnswer);

        try {
            if (answerRecordMapper != null) {
                Integer recordId = request.get("recordId") instanceof Number ?
                        ((Number) request.get("recordId")).intValue() : null;
                Integer questionIndex = request.get("questionIndex") instanceof Number ?
                        ((Number) request.get("questionIndex")).intValue() : null;

                AnswerRecord ar = new AnswerRecord();
                ar.setRecordId(recordId != null ? recordId.longValue() : null);
                ar.setQuestionIndex(questionIndex != null ? questionIndex : 0);
                ar.setUserAnswer(userAnswer);
                ar.setIsCorrect(correct ? 1 : 0);
                ar.setQuestionContent(mapper.writeValueAsString(question));
                ar.setQuestionType(asStr(question.getOrDefault("type", "single")));
                answerRecordMapper.insert(ar);
                log.info("答题记录已保存：{}", ar.getId());
            }
        } catch (Exception e) {
            log.warn("保存答题记录失败：{}", e.getMessage());
        }

        if (!correct) {
            saveWrongQuestion(userId, question, userAnswer, correctAnswer, explanation);
        }

        return ResponseEntity.ok(result);
    }

    @PostMapping("/check-subjective")
    public ResponseEntity<Map<String, Object>> checkSubjective(@RequestBody Map<String, Object> request) {
        Map<String, Object> result = new HashMap<>();
        Long userId = getCurrentUserId();

        String userAnswer = asStr(request.get("userAnswer"));
        if (userAnswer.isEmpty()) {
            result.put("error", "请输入你的答案");
            return ResponseEntity.badRequest().body(result);
        }

        Map<String, Object> question = (Map<String, Object>) request.get("question");
        if (question == null) {
            return ResponseEntity.status(404).body(Map.of("error", "题目不存在"));
        }

        String referenceAnswer = asStr(question.get("answer"));
        String explanation = asStr(question.get("explanation"));

        Map<String, Object> evalResult = callAiForEvaluation(userAnswer, referenceAnswer, explanation);
        String aiEvaluation = asStr(evalResult.getOrDefault("evaluation", ""));
        int score = evalResult.get("score") instanceof Number ? ((Number) evalResult.get("score")).intValue() : 0;

        result.put("evaluation", aiEvaluation);
        result.put("score", score);
        result.put("referenceAnswer", referenceAnswer);
        result.put("explanation", explanation.isEmpty() ? "" : explanation);

        // 分数低于3分（满分5分，60%以下）自动入错题
        if (score < 3) {
            saveWrongQuestion(userId, question, userAnswer, referenceAnswer, explanation, score);
        }

        try {
            if (answerRecordMapper != null) {
                Integer recordId = request.get("recordId") instanceof Number ?
                        ((Number) request.get("recordId")).intValue() : null;
                Integer questionIndex = request.get("questionIndex") instanceof Number ?
                        ((Number) request.get("questionIndex")).intValue() : null;

                AnswerRecord ar = new AnswerRecord();
                ar.setRecordId(recordId != null ? recordId.longValue() : null);
                ar.setQuestionIndex(questionIndex != null ? questionIndex : 0);
                ar.setUserAnswer(userAnswer);
                ar.setIsCorrect(score >= 3 ? 1 : 0);
                ar.setQuestionContent(mapper.writeValueAsString(question));
                ar.setQuestionType("subjective");
                answerRecordMapper.insert(ar);
                log.info("主观题答题记录已保存：{}", ar.getId());
            }
        } catch (Exception e) {
            log.warn("保存主观题答题记录失败：{}", e.getMessage());
        }

        return ResponseEntity.ok(result);
    }

    @PostMapping("/check-batch")
    public ResponseEntity<Map<String, Object>> checkBatch(@RequestBody Map<String, Object> request) {
        Map<String, Object> result = new HashMap<>();
        Long userId = getCurrentUserId();

        List<Map<String, Object>> answers = (List<Map<String, Object>>) request.get("answers");
        if (answers == null || answers.isEmpty()) {
            result.put("error", "请提供答案");
            return ResponseEntity.badRequest().body(result);
        }

        int n = answers.size();
        Map<String, Object>[] results = new Map[n];
        int[] correctCount = {0};

        // 收集主观题 AI 调用的异步任务
        List<CompletableFuture<Void>> futures = new ArrayList<>();

        for (int i = 0; i < n; i++) {
            Map<String, Object> item = answers.get(i);
            Map<String, Object> question = (Map<String, Object>) item.get("question");
            String userAnswer = asStr(item.get("userAnswer"));
            String questionType = asStr(item.getOrDefault("questionType", "single"));
            Integer questionIndex = item.get("questionIndex") instanceof Number ?
                    ((Number) item.get("questionIndex")).intValue() : null;
            Integer recordId = item.get("recordId") instanceof Number ?
                    ((Number) item.get("recordId")).intValue() : null;

            int idx = i;
            if ("subjective".equals(questionType) && question != null) {
                String referenceAnswer = asStr(question.get("answer"));
                String explanation = asStr(question.get("explanation"));
                CompletableFuture<Void> future = CompletableFuture.runAsync(() -> {
                    try {
                        Map<String, Object> evalResult = callAiForEvaluation(userAnswer, referenceAnswer, explanation);
                        String evaluation = asStr(evalResult.getOrDefault("evaluation", ""));
                        int score = evalResult.get("score") instanceof Number ? ((Number) evalResult.get("score")).intValue() : 0;
                        Map<String, Object> sr = new HashMap<>();
                        sr.put("evaluation", evaluation);
                        sr.put("score", score);
                        sr.put("referenceAnswer", referenceAnswer);
                        sr.put("explanation", explanation.isEmpty() ? "" : explanation);
                        sr.put("correct", score >= 3);
                        sr.put("userAnswer", userAnswer);
                        synchronized (correctCount) {
                            if (score >= 3) correctCount[0]++;
                        }
                        if (score < 3) {
                            saveWrongQuestion(userId, question, userAnswer, referenceAnswer, explanation, score);
                        }
                        results[idx] = sr;
                    } catch (Exception e) {
                        log.error("主观题AI评价异步任务异常: {}", e.getMessage());
                        Map<String, Object> sr = new HashMap<>();
                        sr.put("evaluation", "AI 评价服务暂时不可用");
                        sr.put("score", 0);
                        sr.put("referenceAnswer", referenceAnswer);
                        sr.put("explanation", explanation.isEmpty() ? "" : explanation);
                        sr.put("correct", false);
                        sr.put("userAnswer", userAnswer);
                        results[idx] = sr;
                    }
                });
                futures.add(future);
            } else if (question != null) {
                String correctAnswer = asStr(question.get("answer"));
                String explanation = asStr(question.get("explanation"));
                boolean correct = normalizeAnswer(userAnswer).equals(normalizeAnswer(correctAnswer));
                Map<String, Object> sr = new HashMap<>();
                sr.put("correct", correct);
                sr.put("correctAnswer", correctAnswer);
                sr.put("explanation", explanation.isEmpty() ? "" : explanation);
                sr.put("userAnswer", userAnswer);
                if (correct) correctCount[0]++;
                if (!correct) {
                    saveWrongQuestion(userId, question, userAnswer, correctAnswer, explanation);
                }
                results[idx] = sr;
            } else {
                // question 为 null — 写入 fallback 避免 results[idx] 为空
                Map<String, Object> sr = new HashMap<>();
                sr.put("correct", false);
                sr.put("error", "题目数据缺失");
                results[idx] = sr;
            }
        }

        // 等待所有主观题 AI 调用完成，单个失败不影响整体
        try {
            CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
        } catch (Exception e) {
            log.warn("部分主观题AI评价异常: {}", e.getMessage());
        }

        // 保存答题记录
        for (int i = 0; i < n; i++) {
            Map<String, Object> item = answers.get(i);
            Map<String, Object> question = (Map<String, Object>) item.get("question");
            String questionType = asStr(item.getOrDefault("questionType", "single"));
            Integer questionIndex = item.get("questionIndex") instanceof Number ?
                    ((Number) item.get("questionIndex")).intValue() : null;
            Integer recordId = item.get("recordId") instanceof Number ?
                    ((Number) item.get("recordId")).intValue() : null;
            String userAnswer = asStr(item.get("userAnswer"));
            try {
                if (answerRecordMapper != null) {
                    AnswerRecord ar = new AnswerRecord();
                    ar.setRecordId(recordId != null ? recordId.longValue() : null);
                    ar.setQuestionIndex(questionIndex != null ? questionIndex : 0);
                    ar.setUserAnswer(userAnswer);
                    ar.setIsCorrect(Boolean.TRUE.equals(results[i].get("correct")) ? 1 : 0);
                    ar.setQuestionContent(mapper.writeValueAsString(question));
                    ar.setQuestionType(questionType);
                    answerRecordMapper.insert(ar);
                }
            } catch (Exception e) {
                log.warn("保存答题记录失败：{}", e.getMessage());
            }
        }

        // 确保 results 中没有 null（兜底防护）
        List<Map<String, Object>> resultList = new ArrayList<>();
        for (Map<String, Object> r : results) {
            if (r != null) resultList.add(r);
            else {
                Map<String, Object> fallback = new HashMap<>();
                fallback.put("correct", false);
                fallback.put("error", "处理异常");
                resultList.add(fallback);
            }
        }

        result.put("results", resultList);
        result.put("totalCount", n);
        result.put("correctCount", correctCount[0]);
        result.put("wrongCount", n - correctCount[0]);

        return ResponseEntity.ok(result);
    }

    private void saveWrongQuestion(Long userId, Map<String, Object> question, String userAnswer, String correctAnswer, String explanation, Integer score) {
        try {
            if (wrongQuestionMapper != null) {
                String questionId = asStr(question.getOrDefault("id", UUID.randomUUID().toString()));
                String questionType = asStr(question.getOrDefault("type", "single"));

                UserWrongQuestion existing = wrongQuestionMapper.selectOne(
                        new LambdaQueryWrapper<UserWrongQuestion>()
                                .eq(UserWrongQuestion::getUserId, userId)
                                .eq(UserWrongQuestion::getQuestionId, questionId)
                                .eq(UserWrongQuestion::getIsRemoved, 0));

                if (existing != null) {
                    existing.setWrongCount(existing.getWrongCount() + 1);
                    existing.setUserAnswer(userAnswer);
                    if (score != null) existing.setScore(score);
                    wrongQuestionMapper.updateById(existing);
                } else {
                    UserWrongQuestion wq = new UserWrongQuestion();
                    wq.setUserId(userId);
                    wq.setQuestionId(questionId);
                    wq.setQuestionContent(mapper.writeValueAsString(question));
                    wq.setQuestionType(questionType);
                    wq.setUserAnswer(userAnswer);
                    wq.setCorrectAnswer(correctAnswer != null && correctAnswer.length() > 500 ? correctAnswer.substring(0, 500) : correctAnswer);
                    wq.setExplanation(explanation);
                    wq.setScore(score);
                    wq.setWrongCount(1);
                    wq.setIsRemoved(0);
                    wrongQuestionMapper.insert(wq);
                }
            }
        } catch (Exception e) {
            log.warn("保存错题失败：{}", e.getMessage());
        }
    }

    private void saveWrongQuestion(Long userId, Map<String, Object> question, String userAnswer, String correctAnswer, String explanation) {
        saveWrongQuestion(userId, question, userAnswer, correctAnswer, explanation, null);
    }

    private Long getCurrentUserId() {
        if (jwtAuth == null) {
            throw new RuntimeException("未登录");
        }
        return jwtAuth.getCurrentUserId();
    }

    private Map<String, Object> callAiForEvaluation(String userAnswer, String referenceAnswer, String explanation) {
        Map<String, Object> fallback = new HashMap<>();
        fallback.put("evaluation", "AI 评价生成失败，请查看参考答案自行对比。");
        fallback.put("score", 0);
        try {
            Map<String, Object> body = new HashMap<>();
            body.put("model", aiModel);
            body.put("temperature", 0.7);
            body.put("max_tokens", 1024);

            String systemPrompt = "你是一位专业的阅卷老师，请对学生的主观题答案进行评分和评价。";
            String userPrompt = String.format(
                    "学生答案：%s\n\n参考答案：%s\n\n答题思路：%s\n\n请对学生的答案进行评分（1-5分，5分满分）和评价。评价要简洁明了，控制在200字以内。\n\n请严格以JSON格式返回：{\"score\":分数,\"evaluation\":\"评价内容\"}",
                    userAnswer, referenceAnswer, explanation
            );

            List<Map<String, String>> messages = List.of(
                    Map.of("role", "system", "content", systemPrompt),
                    Map.of("role", "user", "content", userPrompt)
            );
            body.put("messages", messages);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(aiKey);

            ResponseEntity<Map> response = restTemplate.exchange(
                    aiUrl, HttpMethod.POST, new HttpEntity<>(body, headers), Map.class);

            String content = "";
            if (response.getBody() != null && response.getBody().containsKey("choices")) {
                List<Map<String, Object>> choices = (List<Map<String, Object>>) response.getBody().get("choices");
                if (choices != null && !choices.isEmpty()) {
                    Map<String, Object> choice = choices.get(0);
                    Map<String, Object> message = (Map<String, Object>) choice.get("message");
                    if (message != null && message.get("content") instanceof String s) {
                        content = s;
                    }
                }
            }

            if (content.isEmpty()) return fallback;

            // 解析JSON响应
            String cleaned = content.replace("```json", "").replace("```", "").trim();
            int start = cleaned.indexOf('{');
            int end = cleaned.lastIndexOf('}');
            if (start >= 0 && end > start) {
                cleaned = cleaned.substring(start, end + 1);
            }
            Map<String, Object> parsed = mapper.readValue(cleaned, new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
            Map<String, Object> evalResult = new HashMap<>();
            evalResult.put("evaluation", parsed.getOrDefault("evaluation", ""));
            Object scoreObj = parsed.get("score");
            int score = 0;
            if (scoreObj instanceof Number) score = ((Number) scoreObj).intValue();
            else if (scoreObj instanceof String) {
                try { score = Integer.parseInt((String) scoreObj); } catch (NumberFormatException ignored) {}
            }
            evalResult.put("score", Math.max(0, Math.min(5, score)));
            return evalResult;
        } catch (Exception e) {
            log.error("AI 评价调用失败：{}", e.getMessage());
            fallback.put("evaluation", "AI 评价服务暂时不可用，请查看参考答案自行对比。");
            return fallback;
        }
    }

    private String normalizeAnswer(String answer) {
        if (answer == null) return "";
        String normalized = answer.replaceAll("[\\s,，、]+", "").toUpperCase();
        char[] chars = normalized.toCharArray();
        Arrays.sort(chars);
        return new String(chars);
    }

    /** 为单个题目生成参考答案和答题思路 */
    @PostMapping("/generate-answer")
    public ResponseEntity<Map<String, Object>> generateAnswer(@RequestBody Map<String, Object> request) {
        Map<String, Object> result = new HashMap<>();
        String question = asStr(request.get("question"));
        String type = asStr(request.getOrDefault("type", "subjective"));
        String category = asStr(request.getOrDefault("category", ""));
        String correctAnswer = asStr(request.get("answer"));
        Map<String, Object> options = request.get("options") instanceof Map ? (Map<String, Object>) request.get("options") : null;

        if (question.isEmpty()) {
            result.put("error", "题目内容为空");
            return ResponseEntity.badRequest().body(result);
        }

        try {
            Map<String, Object> body = new HashMap<>();
            body.put("model", aiModel);
            body.put("temperature", 0.6);
            body.put("max_tokens", 2048);

            String systemPrompt;
            String userPrompt;

            if ("subjective".equals(type)) {
                // 主观题：传入题干+参考答案，要求分析考点和答题要点
                systemPrompt = "你是一位专业的考试辅导教师。请为主观题生成参考答案和答题思路。要求紧扣题目，分析核心考点，给出得分要点。解析控制在150字以内，突出核心要点。";
                userPrompt = String.format(
                    "题目：%s\n%s\n\n" +
                    "请生成：\n" +
                    "1. 参考答案：要点清晰、准确完整\n" +
                    "2. 解析：分析本题考查的核心知识点，给出得分策略（控制在150字以内）\n\n" +
                    "请严格以JSON格式返回：{\"answer\":\"参考答案\",\"explanation\":\"解析内容\"}",
                    question,
                    correctAnswer.isEmpty() ? "" : "参考答案：" + correctAnswer
                );
            } else {
                // 客观题：传入题干+所有选项+标准答案，要求逐一分析每个选项
                systemPrompt = "你是一位专业的考试辅导教师。请为客观题生成简洁解析。要求紧扣题目，明确指出正确答案，简要分析每个选项为什么对或错。解析控制在100字以内，简洁明了。";
                StringBuilder optsStr = new StringBuilder();
                if (options != null && !options.isEmpty()) {
                    for (Map.Entry<String, Object> entry : options.entrySet()) {
                        optsStr.append(entry.getKey()).append(". ").append(entry.getValue()).append("  ");
                    }
                }
                userPrompt = String.format(
                    "题目：%s\n" +
                    "选项：%s\n" +
                    "正确答案：%s\n\n" +
                    "请生成简洁解析（控制在100字以内），要求：\n" +
                    "1. 明确指出正确答案\n" +
                    "2. 简要分析每个选项的对错原因\n" +
                    "3. 说明考查的核心知识点\n\n" +
                    "请严格以JSON格式返回：{\"answer\":\"%s\",\"explanation\":\"解析内容\"}",
                    question,
                    optsStr.toString().isEmpty() ? "无" : optsStr.toString(),
                    correctAnswer.isEmpty() ? "待生成" : correctAnswer,
                    correctAnswer.isEmpty() ? "待生成" : correctAnswer
                );
            }

            List<Map<String, String>> messages = List.of(
                Map.of("role", "system", "content", systemPrompt),
                Map.of("role", "user", "content", userPrompt)
            );
            body.put("messages", messages);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(aiKey);

            ResponseEntity<Map> response = restTemplate.exchange(
                aiUrl, HttpMethod.POST, new HttpEntity<>(body, headers), Map.class);

            String aiContent = "";
            if (response.getBody() != null && response.getBody().containsKey("choices")) {
                List<Map<String, Object>> choices = (List<Map<String, Object>>) response.getBody().get("choices");
                if (choices != null && !choices.isEmpty()) {
                    Map<String, Object> choice = choices.get(0);
                    Map<String, Object> message = (Map<String, Object>) choice.get("message");
                    if (message != null && message.get("content") instanceof String content) {
                        aiContent = content;
                    }
                }
            }

            if (aiContent.isEmpty()) {
                result.put("error", "AI 生成失败");
                return ResponseEntity.status(500).body(result);
            }

            // 解析 JSON 响应
            String cleaned = aiContent.replace("```json", "").replace("```", "").trim();
            int start = cleaned.indexOf('{');
            int end = cleaned.lastIndexOf('}');
            if (start >= 0 && end > start) {
                cleaned = cleaned.substring(start, end + 1);
            }
            Map<String, Object> parsed = mapper.readValue(cleaned, new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
            result.put("answer", parsed.getOrDefault("answer", ""));
            result.put("explanation", parsed.getOrDefault("explanation", ""));
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("生成答案失败: {}", e.getMessage());
            result.put("error", "生成失败: " + e.getMessage());
            return ResponseEntity.status(500).body(result);
        }
    }
}
