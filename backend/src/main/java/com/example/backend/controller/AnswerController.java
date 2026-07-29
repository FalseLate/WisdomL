package com.example.backend.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.example.backend.auth.JwtAuth;
import com.example.backend.entity.AnswerRecord;
import com.example.backend.entity.UserWrongQuestion;
import com.example.backend.mapper.AnswerRecordMapper;
import com.example.backend.mapper.UserWrongQuestionMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.util.*;

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
        if (score > 0 && score < 3) {
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
                ar.setIsCorrect(1);
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

        List<Map<String, Object>> results = new ArrayList<>();
        int correctCount = 0;

        for (Map<String, Object> item : answers) {
            Map<String, Object> question = (Map<String, Object>) item.get("question");
            String userAnswer = asStr(item.get("userAnswer"));
            String questionType = asStr(item.getOrDefault("questionType", "single"));
            Integer questionIndex = item.get("questionIndex") instanceof Number ?
                    ((Number) item.get("questionIndex")).intValue() : null;
            Integer recordId = item.get("recordId") instanceof Number ?
                    ((Number) item.get("recordId")).intValue() : null;

            Map<String, Object> singleResult = new HashMap<>();

            if ("subjective".equals(questionType)) {
                String referenceAnswer = asStr(question.get("answer"));
                String explanation = asStr(question.get("explanation"));
                Map<String, Object> evalResult = callAiForEvaluation(userAnswer, referenceAnswer, explanation);
                String evaluation = asStr(evalResult.getOrDefault("evaluation", ""));
                int score = evalResult.get("score") instanceof Number ? ((Number) evalResult.get("score")).intValue() : 0;
                singleResult.put("evaluation", evaluation);
                singleResult.put("score", score);
                singleResult.put("referenceAnswer", referenceAnswer);
                singleResult.put("explanation", explanation.isEmpty() ? "" : explanation);
                singleResult.put("correct", score >= 3);
                if (score >= 3) correctCount++;
                else saveWrongQuestion(userId, question, userAnswer, referenceAnswer, explanation, score);
            } else {
                String correctAnswer = asStr(question.get("answer"));
                String explanation = asStr(question.get("explanation"));
                boolean correct = normalizeAnswer(userAnswer).equals(normalizeAnswer(correctAnswer));
                singleResult.put("correct", correct);
                singleResult.put("correctAnswer", correctAnswer);
                singleResult.put("explanation", explanation.isEmpty() ? "" : explanation);
                if (correct) correctCount++;

                if (!correct) {
                    saveWrongQuestion(userId, question, userAnswer, correctAnswer, explanation);
                }
            }

            try {
                if (answerRecordMapper != null) {
                    AnswerRecord ar = new AnswerRecord();
                    ar.setRecordId(recordId != null ? recordId.longValue() : null);
                    ar.setQuestionIndex(questionIndex != null ? questionIndex : 0);
                    ar.setUserAnswer(userAnswer);
                    ar.setIsCorrect("subjective".equals(questionType) ? 1 : (Boolean) singleResult.get("correct") ? 1 : 0);
                    ar.setQuestionContent(mapper.writeValueAsString(question));
                    ar.setQuestionType(questionType);
                    answerRecordMapper.insert(ar);
                }
            } catch (Exception e) {
                log.warn("保存答题记录失败：{}", e.getMessage());
            }

            results.add(singleResult);
        }

        result.put("results", results);
        result.put("totalCount", answers.size());
        result.put("correctCount", correctCount);
        result.put("wrongCount", answers.size() - correctCount);

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
        String normalized = answer.replaceAll("\\s+", "").toUpperCase();
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

        if (question.isEmpty()) {
            result.put("error", "题目内容为空");
            return ResponseEntity.badRequest().body(result);
        }

        try {
            Map<String, Object> body = new HashMap<>();
            body.put("model", aiModel);
            body.put("temperature", 0.6);
            body.put("max_tokens", 2048);

            String systemPrompt = "你是一位专业教师，请为题目生成参考答案和答题思路。";
            String userPrompt = String.format(
                "题目类型：%s\n题目内容：%s\n\n请为这道题生成：\n1. 参考答案（要点清晰、准确）\n2. 答题思路（分析考点、解题步骤、得分要点）\n\n请以JSON格式返回：{\"answer\":\"参考答案\",\"explanation\":\"答题思路\"}",
                "subjective".equals(type) ? "主观题" + (category.isEmpty() ? "" : "（" + category + "）") : "客观题",
                question
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
