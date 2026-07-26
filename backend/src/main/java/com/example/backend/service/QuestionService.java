package com.example.backend.service;

import com.example.backend.config.PromptBuilder;
import com.example.backend.config.QuestionConfig;
import com.example.backend.dto.QuestionDTO;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.util.*;

@Service
public class QuestionService {

    private static final Logger log = LoggerFactory.getLogger(QuestionService.class);
    private static final ObjectMapper mapper = new ObjectMapper();
    private static final int MAX_RETRIES = 2;

    @Value("${ai.api.url}")
    private String apiUrl;

    @Value("${ai.api.key}")
    private String apiKey;

    @Value("${ai.model}")
    private String modelName;

    private final RestTemplate restTemplate;

    public QuestionService() {
        this.restTemplate = new RestTemplate();
        // 60秒超时
        var rf = restTemplate.getRequestFactory();
        if (rf instanceof org.springframework.http.client.SimpleClientHttpRequestFactory sf) {
            sf.setConnectTimeout((int) Duration.ofSeconds(15).toMillis());
            sf.setReadTimeout((int) Duration.ofSeconds(60).toMillis());
        }
    }

    public QuestionDTO generate(String text, String questionType) {
        QuestionDTO dto = new QuestionDTO();
        if (text == null || text.trim().isEmpty()) {
            dto.setErrorMessage("文本内容为空");
            return dto;
        }
        String cleanText = text.trim();
        dto.setTextPreview(cleanText.length() > 150 ? cleanText.substring(0, 150) + "..." : cleanText);

        int len = cleanText.length();
        Map<String, Integer> counts = QuestionConfig.getCounts(len, questionType);
        int objNum = counts.get("objNum");
        int subNum = counts.get("subNum");
        dto.setObjectiveCount(objNum);
        dto.setSubjectiveCount(subNum);
        dto.setTotalCount(objNum + subNum);

        Map<String, String> prompts = PromptBuilder.buildPrompts(cleanText, questionType);
        String rawResponse = callAiWithRetry(prompts.get("system"), prompts.get("user"));

        String json = cleanJson(rawResponse);
        List<Map<String, Object>> objList = new ArrayList<>();
        List<Map<String, Object>> subList = new ArrayList<>();

        try {
            Map<String, Object> parsed = mapper.readValue(json, new TypeReference<Map<String, Object>>() {});
            Object rawObj = parsed.getOrDefault("objectiveQuestions", Collections.emptyList());
            if (rawObj instanceof List) {
                for (Object item : (List<?>) rawObj) {
                    if (item instanceof Map) {
                        Map<String, Object> q = (Map<String, Object>) item;
                        q.putIfAbsent("id", UUID.randomUUID().toString());
                        objList.add(q);
                    }
                }
            }
            Object rawSub = parsed.getOrDefault("subjectiveQuestions", Collections.emptyList());
            if (rawSub instanceof List) {
                for (Object item : (List<?>) rawSub) {
                    if (item instanceof Map) {
                        Map<String, Object> q = (Map<String, Object>) item;
                        q.putIfAbsent("id", UUID.randomUUID().toString());
                        subList.add(q);
                    }
                }
            }
        } catch (Exception e) {
            log.error("JSON解析失败: {}", e.getMessage());
            dto.setErrorMessage("AI返回格式异常: " + e.getMessage());
        }
        dto.setObjectiveQuestions(objList);
        dto.setSubjectiveQuestions(subList);

        // 后处理：确保所有题目都有答案和解析
        ensureAnswersAndExplanations(objList);
        ensureAnswersAndExplanations(subList);

        return dto;
    }

    /**
     * 确保题目列表中的每道题都有 answer 和 explanation。
     * 缺失时调用 AI 单独补全。
     */
    public void ensureAnswersAndExplanations(List<Map<String, Object>> questions) {
        if (questions == null || questions.isEmpty()) return;
        for (Map<String, Object> q : questions) {
            String answer = (String) q.get("answer");
            String explanation = (String) q.get("explanation");
            boolean missingAnswer = answer == null || answer.isBlank()
                || "参考答案未提供".equals(answer) || "未提供".equals(answer);
            boolean missingExplanation = explanation == null || explanation.isBlank()
                || "解析未提供".equals(explanation) || "解析生成失败".equals(explanation) || "未提供".equals(explanation);

            if (missingAnswer || missingExplanation) {
                String questionText = (String) q.get("question");
                String type = (String) q.getOrDefault("type", "subjective");
                log.info("题目 {} 缺少答案/解析，自动补全中...", q.get("id"));
                Map<String, String> generated = generateAnswerForQuestion(questionText, type);
                if (missingAnswer && generated.containsKey("answer") && !generated.get("answer").isBlank()) {
                    q.put("answer", generated.get("answer"));
                }
                if (missingExplanation && generated.containsKey("explanation") && !generated.get("explanation").isBlank()) {
                    q.put("explanation", generated.get("explanation"));
                }
            }
        }
    }

    /**
     * 为单个题目调用 AI 生成参考答案和答题思路。
     * 返回包含 answer 和 explanation 的 Map。
     */
    public Map<String, String> generateAnswerForQuestion(String questionText, String type) {
        Map<String, String> result = new HashMap<>();
        if (questionText == null || questionText.isBlank()) return result;
        try {
            String systemPrompt = "你是一位专业教师，请为题目生成参考答案和答题思路。";
            String userPrompt = String.format(
                "题目类型：%s\n题目内容：%s\n\n请为这道题生成：\n1. 参考答案（要点清晰、准确）\n2. 答题思路（分析考点、解题步骤、得分要点）\n\n请以JSON格式返回：{\"answer\":\"参考答案\",\"explanation\":\"答题思路\"}",
                "subjective".equals(type) ? "主观题" : "客观题",
                questionText
            );
            String rawResponse = callAiWithRetry(systemPrompt, userPrompt);
            String json = cleanJson(rawResponse);
            Map<String, Object> parsed = mapper.readValue(json, new TypeReference<Map<String, Object>>() {});
            result.put("answer", (String) parsed.getOrDefault("answer", ""));
            result.put("explanation", (String) parsed.getOrDefault("explanation", ""));
        } catch (Exception e) {
            log.warn("为题目生成答案失败: {}", e.getMessage());
        }
        return result;
    }


    public String callAIContent(String systemPrompt, String userPrompt) {
        return callAiWithRetry(systemPrompt, userPrompt);
    }
    private String callAiWithRetry(String system, String user) {
        for (int i = 0; i < MAX_RETRIES; i++) {
            try {
                String result = callAi(system, user);
                if (!result.equals("{}")) return result;
                log.warn("AI返回空结果, 第{}次重试", i + 1);
            } catch (Exception e) {
                log.warn("AI调用第{}次失败: {}", i + 1, e.getMessage());
                if (i == MAX_RETRIES - 1) return "{}";
            }
        }
        return "{}";
    }

    private String callAi(String system, String user) {
        Map<String, Object> body = new HashMap<>();
        body.put("model", modelName);
        body.put("temperature", 0.6);
        body.put("max_tokens", 4096);

        List<Map<String, String>> messages = List.of(
            Map.of("role", "system", "content", system),
            Map.of("role", "user", "content", user)
        );
        body.put("messages", messages);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(apiKey);

        ResponseEntity<Map> response = restTemplate.exchange(
            apiUrl, HttpMethod.POST, new HttpEntity<>(body, headers), Map.class);

        if (response.getBody() != null && response.getBody().containsKey("choices")) {
            List<Map<String, Object>> choices = (List<Map<String, Object>>) response.getBody().get("choices");
            if (choices != null && !choices.isEmpty()) {
                Map<String, Object> choice = choices.get(0);
                Map<String, Object> message = (Map<String, Object>) choice.get("message");
                if (message != null && message.get("content") instanceof String s) {
                    return s;
                }
            }
        }
        return "{}";
    }

    private String cleanJson(String raw) {
        if (raw == null || raw.isBlank()) return "{}";
        String cleaned = raw.replace("```json", "").replace("```", "").trim();
        int start = cleaned.indexOf('{');
        int end = cleaned.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return cleaned.substring(start, end + 1);
        }
        return cleaned;
    }
}
