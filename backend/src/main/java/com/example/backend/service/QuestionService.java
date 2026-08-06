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
    private static final int MAX_RETRIES = 1;

    @Value("${ai.api.url}")
    private String apiUrl;

    @Value("${ai.api.key}")
    private String apiKey;

    @Value("${ai.model}")
    private String modelName;

    private final RestTemplate restTemplate;

    public QuestionService() {
        this.restTemplate = new RestTemplate();
        // 180秒超时（长文档分析需要更长时间）
        var rf = restTemplate.getRequestFactory();
        if (rf instanceof org.springframework.http.client.SimpleClientHttpRequestFactory sf) {
            sf.setConnectTimeout((int) Duration.ofSeconds(15).toMillis());
            sf.setReadTimeout((int) Duration.ofSeconds(90).toMillis());
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

        parseQuestions(rawResponse, dto);

        // 不再同步补全答案和解析，前端可逐个触发重新生成
        return dto;
    }

    /**
     * 并行出题：将长文本拆分为 2500 字左右的片段，并行调用 AI 出题，最后合并。
     * 大幅降低单次调用耗时，总耗时约等于单次调用时间。
     */
    public QuestionDTO generateParallel(String text, String questionType) {
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

        // 1500 字以下：出题+答案+解析，单次调用
        boolean noAnswers = len > 1500;
        if (len <= 1500) {
            Map<String, String> prompts = PromptBuilder.buildPrompts(cleanText, questionType);
            String raw = callAi(prompts.get("system"), prompts.get("user"), 4096);
            parseQuestions(raw, dto);
            return dto;
        }

        // 拆分文本为 ~1500 字片段，只出题不生成答案
        List<String> chunks = new ArrayList<>();
        int pos = 0;
        while (pos < len) {
            int end = Math.min(pos + 1500, len);
            if (end < len) {
                int nl = cleanText.lastIndexOf('\n', end);
                if (nl > pos + 800) end = nl;
            }
            chunks.add(cleanText.substring(pos, end).trim());
            pos = end;
        }

        // 真正并行调用
        // 每片最多10道题，防止max_tokens不足导致JSON截断
        int rawPerObj = Math.max(1, objNum / chunks.size());
        int rawPerSub = Math.max(1, subNum / chunks.size());
        int perObj = Math.min(rawPerObj, 10);
        int perSub = Math.min(rawPerSub, 10);
        
        List<java.util.concurrent.CompletableFuture<QuestionDTO>> futures = new ArrayList<>();
        for (int i = 0; i < chunks.size(); i++) {
            final int idx = i;
            final String chunk = chunks.get(i);
            int cObj = (idx == chunks.size() - 1) ? objNum - perObj * idx : perObj;
            int cSub = (idx == chunks.size() - 1) ? subNum - perSub * idx : perSub;
            String adjustedQT = buildAdjustedPrompt(chunk, questionType, cObj, cSub, true);
            futures.add(java.util.concurrent.CompletableFuture.supplyAsync(() -> {
                try {
                    String raw = callAi("你是一名专业的出题老师。", adjustedQT, 8192);
                    QuestionDTO part = new QuestionDTO();
                    parseQuestions(raw, part);
                    return part;
                } catch (Exception e) {
                    log.warn("并行出题片段 {} 失败: {}", idx, e.getMessage());
                    return null;
                }
            }));
        }
        
        // 真正并行等待全部完成，合并结果
        List<QuestionDTO> partialResults = new ArrayList<>();
        try {
            java.util.concurrent.CompletableFuture.allOf(futures.toArray(new java.util.concurrent.CompletableFuture[0]))
                .get(90, java.util.concurrent.TimeUnit.SECONDS);
        } catch (Exception e) {
            log.warn("并行出题整体超时: {}", e.getMessage());
        }
        for (var f : futures) {
            try {
                QuestionDTO part = f.getNow(null);
                if (part != null) partialResults.add(part);
            } catch (Exception e) {
                log.warn("并行出题片段获取失败: {}", e.getMessage());
            }
        }

        // 统计缺失数量，自动重试一次
        int actualObj = 0, actualSub = 0;
        for (QuestionDTO part : partialResults) {
            if (part.getObjectiveQuestions() != null) actualObj += part.getObjectiveQuestions().size();
            if (part.getSubjectiveQuestions() != null) actualSub += part.getSubjectiveQuestions().size();
        }
        int missingObj = Math.max(0, objNum - actualObj);
        int missingSub = Math.max(0, subNum - actualSub);
        if (missingObj + missingSub > 0) {
            log.info("并行出题缺失: 客观{}题, 主观{}题, 分批重试...", missingObj, missingSub);
            int BATCH_SIZE = 8;
            int remainingObj = missingObj;
            int remainingSub = missingSub;
            int batchNum = 0;
            while (remainingObj + remainingSub > 0) {
                batchNum++;
                int batchObj = Math.min(remainingObj, (BATCH_SIZE + 1) / 2);
                int batchSub = Math.min(remainingSub, BATCH_SIZE / 2);
                if (batchObj + batchSub == 0) break;
                try {
                    String retryPrompt = buildAdjustedPrompt(cleanText.length() > 1500 ? cleanText.substring(0, 1500) : cleanText, questionType, batchObj, batchSub, true);
                    String retryRaw = callAi("你是一名专业的出题老师。", retryPrompt, 8192);
                    QuestionDTO retryPart = new QuestionDTO();
                    parseQuestions(retryRaw, retryPart);
                    partialResults.add(retryPart);
                    int gotObj = retryPart.getObjectiveQuestions() != null ? retryPart.getObjectiveQuestions().size() : 0;
                    int gotSub = retryPart.getSubjectiveQuestions() != null ? retryPart.getSubjectiveQuestions().size() : 0;
                    remainingObj -= gotObj;
                    remainingSub -= gotSub;
                    log.info("重试批次{}: 客观{}题, 主观{}题 (剩余: 客观{}, 主观{})", batchNum, gotObj, gotSub, remainingObj, remainingSub);
                } catch (Exception e) {
                    log.warn("重试批次{}失败: {}", batchNum, e.getMessage());
                    break;
                }
            }
        }

        // 合并结果，裁剪到目标数量
        List<Map<String, Object>> allObj = new ArrayList<>();
        List<Map<String, Object>> allSub = new ArrayList<>();
        for (QuestionDTO part : partialResults) {
            if (part.getObjectiveQuestions() != null) allObj.addAll(part.getObjectiveQuestions());
            if (part.getSubjectiveQuestions() != null) allSub.addAll(part.getSubjectiveQuestions());
        }
        if (allObj.size() > objNum) allObj = new ArrayList<>(allObj.subList(0, objNum));
        if (allSub.size() > subNum) allSub = new ArrayList<>(allSub.subList(0, subNum));
        dto.setObjectiveQuestions(allObj);
        dto.setSubjectiveQuestions(allSub);
        return dto;
    }

    private String buildAdjustedPrompt(String text, String questionType, int objNum, int subNum, boolean noAnswers) {
        StringBuilder sb = new StringBuilder();
        sb.append("请严格根据以下资料出题。\n\n");
        if (objNum > 0) {
            sb.append("【客观题要求】共").append(objNum).append("道，包含单选题、多选题。每题options格式必须为{\"A\":\"\",\"B\":\"\",\"C\":\"\",\"D\":\"\"}。\n");
            if (noAnswers) {
                sb.append("每题必须包含type(必须为single或multiple)/question/options/answer字段，但不要生成explanation。\n");
            }
        } else {
            sb.append("【客观题】无需出客观题，返回空数组。\n");
        }
        if (subNum > 0) {
            sb.append("【主观题要求】共").append(subNum).append("道。\n");
            if (noAnswers) {
                sb.append("每题必须包含type/question/answer字段，但不要生成explanation。\n");
            }
        } else {
            sb.append("【主观题】无需出主观题，返回空数组。\n");
        }
        sb.append("返回纯JSON：{\"objectiveQuestions\":[],\"subjectiveQuestions\":[]}\n\n");
        sb.append("资料原文：\n").append(text);
        return sb.toString();
    }

    private static final String[] OPTION_LETTERS = {"A","B","C","D","E","F","G","H"};

    private void normalizeOptions(Map<String, Object> q) {
        Object opts = q.get("options");
        if (opts == null) return;
        if (opts instanceof List) {
            List<?> list = (List<?>) opts;
            Map<String, String> map = new LinkedHashMap<>();
            for (int i = 0; i < list.size() && i < OPTION_LETTERS.length; i++) {
                map.put(OPTION_LETTERS[i], String.valueOf(list.get(i)));
            }
            q.put("options", map);
        }
    }

    private void parseQuestions(String raw, QuestionDTO dto) {
        String json = cleanJson(raw);
        List<Map<String, Object>> objList = new ArrayList<>();
        List<Map<String, Object>> subList = new ArrayList<>();
        try {
            Map<String, Object> parsed = null;
            try {
                parsed = mapper.readValue(json, new TypeReference<Map<String, Object>>() {});
            } catch (Exception parseEx) {
                log.warn("JSON首次解析失败，尝试截断恢复...");
                parsed = recoverTruncatedJson(json);
                if (parsed == null) throw parseEx;
            }
            Object rawObj = parsed.getOrDefault("objectiveQuestions", Collections.emptyList());
            if (rawObj instanceof List) {
                for (Object item : (List<?>) rawObj) {
                    if (item instanceof Map) {
                        Map<String, Object> q = (Map<String, Object>) item;
                        q.putIfAbsent("id", UUID.randomUUID().toString());
                        normalizeOptions(q);
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
        }
        // 简单后处理：信任AI返回的type，只做最小验证
        List<Map<String, Object>> finalObj = new ArrayList<>();
        List<Map<String, Object>> finalSub = new ArrayList<>(subList);
        for (Map<String, Object> q : objList) {
            String t = (String) q.get("type");
            // 保持AI返回的类型，只验证是否有效
            if ("subjective".equals(t)) {
                finalSub.add(q);
            } else if ("multiple".equals(t) || "single".equals(t)) {
                finalObj.add(q);
            } else {
                // 未知类型：通过options判断
                Object opts = q.get("options");
                int optCount = 0;
                if (opts instanceof Map) {
                    for (Object v : ((Map<?,?>)opts).values()) {
                        if (v != null && !String.valueOf(v).trim().isEmpty()) optCount++;
                    }
                }
                q.put("type", optCount >= 2 ? "single" : "subjective");
                if (optCount >= 2) finalObj.add(q); else finalSub.add(q);
            }
        }
        for (Map<String, Object> q : finalSub) {
            q.put("type", "subjective"); // 覆盖未知type（如AI返回的"question"）
        }

        // ===== 二次校验：subjective但answer为字母→重分类为客观题 =====
        List<Map<String, Object>> reclassified = new ArrayList<>();
        for (Map<String, Object> q : finalSub) {
            String answer = (String) q.getOrDefault("answer", "");
            Object opts = q.get("options");
            boolean hasOpts = opts instanceof Map && ((Map<?,?>) opts).size() >= 2;
            if (answer != null && answer.matches("[A-E]{1,2}") && !hasOpts) {
                Map<String, String> defaultOpts = new LinkedHashMap<>();
                defaultOpts.put("A", "正确");
                defaultOpts.put("B", "错误");
                q.put("options", defaultOpts);
                q.put("type", answer.length() > 1 ? "multiple" : "single");
                reclassified.add(q);
                log.info("parseQuestions二次校验: answer={} -> type={}", answer, q.get("type"));
            }
        }
        if (!reclassified.isEmpty()) {
            finalSub.removeAll(reclassified);
            finalObj.addAll(reclassified);
        }

        dto.setObjectiveQuestions(finalObj);
        dto.setSubjectiveQuestions(finalSub);
    }

    /**
     * 确保题目列表中的每道题都有 answer 和 explanation。
     * 缺失时调用 AI 单独补全。
     */
    public void ensureAnswersAndExplanations(List<Map<String, Object>> questions) {
        if (questions == null || questions.isEmpty()) return;
        List<java.util.concurrent.CompletableFuture<Void>> futures = new ArrayList<>();
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
                futures.add(java.util.concurrent.CompletableFuture.runAsync(() -> {
                    log.info("题目 {} 缺少答案/解析，并行生成中(15s超时)...", q.get("id"));
                    try {
                        Map<String, String> generated = generateAnswerForQuestionWithTimeout(questionText, type, 15);
                        if (missingAnswer && generated.containsKey("answer") && !generated.get("answer").isBlank()) {
                            q.put("answer", generated.get("answer"));
                        }
                        if (missingExplanation && generated.containsKey("explanation") && !generated.get("explanation").isBlank()) {
                            q.put("explanation", generated.get("explanation"));
                        }
                    } catch (Exception e) {
                        log.warn("题目 {} 答案并行生成失败: {}", q.get("id"), e.getMessage());
                    }
                }));
            }
        }
        if (!futures.isEmpty()) {
            try {
                java.util.concurrent.CompletableFuture.allOf(futures.toArray(new java.util.concurrent.CompletableFuture[0]))
                    .get(20, java.util.concurrent.TimeUnit.SECONDS);
            } catch (Exception e) {
                log.warn("批量答案生成部分超时: {}", e.getMessage());
            }
        }
    }

    private Map<String, String> generateAnswerForQuestionWithTimeout(String questionText, String type, int timeoutSec) {
        Map<String, String> result = new HashMap<>();
        if (questionText == null || questionText.isBlank()) return result;
        try {
            RestTemplate shortRt = new RestTemplate();
            var rf = shortRt.getRequestFactory();
            if (rf instanceof org.springframework.http.client.SimpleClientHttpRequestFactory sf) {
                sf.setConnectTimeout(5000);
                sf.setReadTimeout(timeoutSec * 1000);
            }
            Map<String, Object> body = new HashMap<>();
            body.put("model", modelName);
            body.put("temperature", 0.6);
            body.put("max_tokens", 2048);
            String userPrompt = String.format(
                "题目类型：%s\n题目内容：%s\n\n请为这道题生成：\n1. 参考答案（要点清晰、准确）\n2. 答题思路（分析考点、解题步骤、得分要点）\n\n请以JSON格式返回：{\"answer\":\"参考答案\",\"explanation\":\"答题思路\"}",
                "subjective".equals(type) ? "主观题" : "客观题", questionText
            );
            body.put("messages", List.of(
                Map.of("role", "system", "content", "你是一位专业教师，请为题目生成参考答案和答题思路。"),
                Map.of("role", "user", "content", userPrompt)
            ));
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(apiKey);
            ResponseEntity<Map> response = shortRt.exchange(apiUrl, HttpMethod.POST, new HttpEntity<>(body, headers), Map.class);
            if (response.getBody() != null && response.getBody().containsKey("choices")) {
                List<Map<String, Object>> choices = (List<Map<String, Object>>) response.getBody().get("choices");
                if (choices != null && !choices.isEmpty()) {
                    Map<String, Object> msg = (Map<String, Object>) ((Map<String, Object>) choices.get(0)).get("message");
                    if (msg != null && msg.get("content") instanceof String s) {
                        String json = cleanJson(s);
                        Map<String, Object> parsed = mapper.readValue(json, new TypeReference<Map<String, Object>>() {});
                        result.put("answer", (String) parsed.getOrDefault("answer", ""));
                        result.put("explanation", (String) parsed.getOrDefault("explanation", ""));
                    }
                }
            }
        } catch (Exception e) {
            log.warn("单题答案生成失败: {}", e.getMessage());
        }
        return result;
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
        return callAi(system, user, 4096);
    }
    private String callAiWithRetry(String system, String user, int maxTokens) {
        for (int i = 0; i < MAX_RETRIES; i++) {
            try {
                String result = callAi(system, user, maxTokens);
                if (!result.equals("{}")) return result;
                log.warn("AI返回空结果, 第{}次重试", i + 1);
            } catch (Exception e) {
                log.warn("AI调用第{}次失败: {}", i + 1, e.getMessage());
                if (i == MAX_RETRIES - 1) return "{}";
            }
        }
        return "{}";
    }

    private String callAi(String system, String user, int maxTokens) {
        Map<String, Object> body = new HashMap<>();
        body.put("model", modelName);
        body.put("temperature", 0.6);
        body.put("max_tokens", maxTokens);

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

    /** 截断JSON恢复 */
    private Map<String, Object> recoverTruncatedJson(String json) {
        try {
            int lastBrace = json.lastIndexOf('}');
            if (lastBrace < 0) return null;
            String truncated = json.substring(0, lastBrace + 1);
            String[] closers = { "}]}", "}}", "}]" };
            for (String closer : closers) {
                try {
                    Map<String, Object> result = mapper.readValue(truncated + closer, new TypeReference<Map<String, Object>>() {});
                    int total = 0;
                    Object rawObj = result.get("objectiveQuestions");
                    Object rawSub = result.get("subjectiveQuestions");
                    if (rawObj instanceof List) total += ((List<?>) rawObj).size();
                    if (rawSub instanceof List) total += ((List<?>) rawSub).size();
                    if (total > 0) { log.info("截断恢复成功: {}题", total); return result; }
                } catch (Exception ignored) {}
            }
            return extractPartialQuestions(truncated);
        } catch (Exception e) { log.warn("截断恢复失败: {}", e.getMessage()); return null; }
    }

    private Map<String, Object> extractPartialQuestions(String json) {
        List<Map<String, Object>> objList = new ArrayList<>();
        List<Map<String, Object>> subList = new ArrayList<>();
        int depth = 0; int start = -1;
        for (int i = 0; i < json.length(); i++) {
            char c = json.charAt(i);
            if (c == '{') { if (depth == 0) start = i; depth++; }
            else if (c == '}') { depth--; if (depth == 0 && start >= 0) {
                try {
                    Map<String, Object> q = mapper.readValue(json.substring(start, i + 1), new TypeReference<Map<String, Object>>() {});
                    if (q.containsKey("question")) {
                        if ("subjective".equals(q.getOrDefault("type", ""))) subList.add(q); else objList.add(q);
                    }
                } catch (Exception ignored) {}
                start = -1;
            }}
        }
        // 尝试恢复最后一个未闭合的块
        if (depth > 0 && start >= 0 && start < json.length() - 1) {
            String lastChunk = json.substring(start);
            for (int trim = lastChunk.length() - 1; trim > 20; trim--) {
                try {
                    String attempt = lastChunk.substring(0, trim) + "}";
                    Map<String, Object> q = mapper.readValue(attempt, new TypeReference<Map<String, Object>>() {});
                    if (q.containsKey("question")) {
                        if ("subjective".equals(q.getOrDefault("type", ""))) subList.add(q); else objList.add(q);
                        log.info("截断恢复: 成功恢复最后1道题");
                        break;
                    }
                } catch (Exception ignored) {}
            }
        }
        if (objList.isEmpty() && subList.isEmpty()) return null;
        Map<String, Object> result = new HashMap<>();
        result.put("objectiveQuestions", objList);
        result.put("subjectiveQuestions", subList);
        log.info("逐段恢复: {}题", objList.size() + subList.size());
        return result;
    }
}
