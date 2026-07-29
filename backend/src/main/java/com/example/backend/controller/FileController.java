package com.example.backend.controller;

import com.example.backend.auth.JwtAuth;
import com.example.backend.dto.QuestionDTO;
import com.example.backend.entity.QuestionRecord;
import com.example.backend.mapper.QuestionRecordMapper;
import com.example.backend.service.QuestionService;
import com.example.backend.service.SectionSplitter;
import com.example.backend.service.SectionSplitter.Section;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xwpf.extractor.XWPFWordExtractor;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.LinkedHashMap;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/api")
public class FileController {

    private static final Logger log = LoggerFactory.getLogger(FileController.class);

    @Autowired
    private QuestionService questionService;

    @Autowired(required = false)
    private JwtAuth jwtAuth;

    @Autowired(required = false)
    private QuestionRecordMapper questionRecordMapper;

    @Autowired
    private SectionSplitter sectionSplitter;

    @Value("${ai.api.url}")
    private String apiUrl;

    @Value("${ai.api.key}")
    private String apiKey;

    @Value("${ai.model}")
    private String modelName;

    private static final ObjectMapper mapper = new ObjectMapper();

    private static final Pattern QUESTION_PATTERN = Pattern.compile(
            "(?m)^\\s*(\\d+)[.、)）]\\s*(.+?)(?=\\n\\s*\\d+[.、)）]|\\n\\s*答案[:：]|\\n\\s*参考|\\Z)",
            Pattern.DOTALL
    );

    private static final Pattern ANSWER_PATTERN = Pattern.compile(
            "(?mi)^\\s*(?:答案|参考答案|正确答[案对])[:：]\\s*([A-E]+|[^\n]+)",
            Pattern.DOTALL
    );

    @PostMapping("/upload")
    public ResponseEntity<Map<String, Object>> uploadFile(@RequestParam("file") MultipartFile file) {
        Map<String, Object> result = new HashMap<>();
        if (file.isEmpty()) {
            result.put("error", "文件为空");
            return ResponseEntity.badRequest().body(result);
        }

        String fileName = file.getOriginalFilename();
        String suffix = fileName != null ? fileName.toLowerCase() : "";

        try {
            String text;
            if (suffix.endsWith(".pdf")) {
                text = extractPdfText(file);
            } else if (suffix.endsWith(".docx")) {
                text = extractWordText(file);
            } else if (suffix.endsWith(".txt")) {
                text = new String(file.getBytes(), StandardCharsets.UTF_8);
            } else {
                result.put("error", "仅支持 PDF、Word(.docx) 和 TXT 文件");
                return ResponseEntity.badRequest().body(result);
            }

            if (text.trim().isEmpty()) {
                result.put("error", "未能提取到文字内容");
                return ResponseEntity.badRequest().body(result);
            }

            // 正则快速检测：纯题目文档
            boolean isPureQuestions = detectPureQuestions(text);
            result.put("isPureQuestions", isPureQuestions);

            if (isPureQuestions) {
                List<Map<String, Object>> extractedQuestions = extractQuestionsFromText(text);
                result.put("extractedQuestions", extractedQuestions);
                result.put("questionCount", extractedQuestions.size());
            }

            // 正则快速拆分章节（秒返）
            List<Section> sections = sectionSplitter.split(text, fileName);
            int totalWords = sections.stream().mapToInt(Section::getWordCount).sum();
            result.put("fileName", fileName);
            result.put("totalWords", totalWords);
            result.put("sections", sections.stream().map(s -> Map.of(
                    "id", s.getId(), "title", s.getTitle(), "text", s.getText(), "wordCount", s.getWordCount()
            )).toList());
            return ResponseEntity.ok(result);

        } catch (Exception e) {
            log.error("文件处理失败", e);
            result.put("error", "文件处理失败: " + e.getMessage());
            return ResponseEntity.status(500).body(result);
        }
    }

    @PostMapping("/generate-from-sections")
    public ResponseEntity<Map<String, Object>> generateFromSections(@RequestBody Map<String, Object> request) {
        Map<String, Object> result = new HashMap<>();
        List<String> sectionIds = (List<String>) request.get("sectionIds");
        Map<String, String> sectionTexts = (Map<String, String>) request.get("sectionTexts");
        String questionType = (String) request.getOrDefault("questionType", "all");

        if (sectionIds == null || sectionIds.isEmpty() || sectionTexts == null) {
            result.put("error", "请至少选择一个章节");
            return ResponseEntity.badRequest().body(result);
        }

        List<Map<String, Object>> allObjective = new ArrayList<>();
        List<Map<String, Object>> allSubjective = new ArrayList<>();
        int totalObj = 0;
        int totalSub = 0;

        for (String id : sectionIds) {
            String t = sectionTexts.get(id);
            if (t == null || t.trim().isEmpty()) continue;

            try {
                QuestionDTO dto = questionService.generateParallel(t, questionType);
                // 给每道题打上章节标签
                String chapterName = extractChapterName(t);
                for (Map<String, Object> q : dto.getObjectiveQuestions()) {
                    q.put("chapterId", id);
                    q.put("chapterName", chapterName);
                }
                for (Map<String, Object> q : dto.getSubjectiveQuestions()) {
                    q.put("chapterId", id);
                    q.put("chapterName", chapterName);
                }
                allObjective.addAll(dto.getObjectiveQuestions());
                allSubjective.addAll(dto.getSubjectiveQuestions());
                totalObj += dto.getObjectiveCount();
                totalSub += dto.getSubjectiveCount();
            } catch (Exception e) {
                log.error("章节 {} 生成题目失败: {}", id, e.getMessage());
            }
        }

        if (allObjective.isEmpty() && allSubjective.isEmpty()) {
            result.put("error", "题目生成失败，请重试");
            return ResponseEntity.status(500).body(result);
        }

        QuestionDTO combinedDto = new QuestionDTO();
        combinedDto.setObjectiveQuestions(allObjective);
        combinedDto.setSubjectiveQuestions(allSubjective);
        combinedDto.setObjectiveCount(totalObj);
        combinedDto.setSubjectiveCount(totalSub);
        combinedDto.setTotalCount(totalObj + totalSub);

        String combinedText = String.join("\n\n", sectionIds.stream()
                .map(sectionTexts::get)
                .filter(Objects::nonNull)
                .toList());
        saveSectionRecord(combinedText, combinedDto);

        result.put("questions", allObjective);
        result.put("subjectiveQuestions", allSubjective);
        result.put("totalCount", totalObj + totalSub);
        result.put("objectiveCount", totalObj);
        result.put("subjectiveCount", totalSub);

        return ResponseEntity.ok(result);
    }



    @PostMapping("/verify-answers")
    public ResponseEntity<Map<String, Object>> verifyAnswers(@RequestBody Map<String, Object> request) {
        Map<String, Object> result = new HashMap<>();
        List<Map<String, Object>> questions = (List<Map<String, Object>>) request.get("questions");
        if (questions == null || questions.isEmpty()) {
            result.put("error", "未提供题目");
            return ResponseEntity.badRequest().body(result);
        }

        // 构建AI验证prompt
        StringBuilder prompt = new StringBuilder();
        prompt.append("请验证以下题目的答案是否正确，并给出详细解析。\n");
        prompt.append("要求：\n");
        prompt.append("1. 如果原答案正确，保留并补充详细解析\n");
        prompt.append("2. 如果原答案错误，给出正确答案和解析\n");
        prompt.append("3. 返回JSON格式，每题包含：id, verifiedAnswer(验证后的答案), explanation(详细解析), isCorrect(原答案是否正确)\n\n");
        
        for (Map<String, Object> q : questions) {
            prompt.append("题目：").append(q.get("question")).append("\n");
            if (q.containsKey("options")) {
                Map<String, String> opts = (Map<String, String>) q.get("options");
                for (Map.Entry<String, String> opt : opts.entrySet()) {
                    prompt.append(opt.getKey()).append(". ").append(opt.getValue()).append("\n");
                }
            }
            prompt.append("原答案：").append(q.getOrDefault("answer", "未提供")).append("\n\n");
        }
        
        prompt.append("请返回JSON数组格式：[{\"id\":\"题目ID\",\"verifiedAnswer\":\"验证后答案\",\"explanation\":\"详细解析\",\"isCorrect\":true/false}]");

        try {
            String aiResponse = questionService.callAIContent("你是一位专业的出题和阅卷老师", prompt.toString());
            List<Map<String, Object>> verifiedResults = parseAIResponse(aiResponse);
            
            // 合并验证结果到原题
            for (int i = 0; i < questions.size(); i++) {
                Map<String, Object> q = questions.get(i);
                Map<String, Object> verified = verifiedResults.stream()
                    .filter(v -> q.get("id").equals(v.get("id")))
                    .findFirst()
                    .orElse(null);
                
                if (verified != null) {
                    q.put("answer", verified.getOrDefault("verifiedAnswer", q.get("answer")));
                    q.put("explanation", verified.getOrDefault("explanation", ""));
                }
            }
            
            // 缺失答案的题目前端有 regenerate 按钮兜底，不在此阻塞
            
            result.put("questions", questions);
            result.put("success", true);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            // 批量验证失败，不阻塞，前端 regenerate 兜底
            log.warn("批量验证失败: {}", e.getMessage());
            result.put("questions", questions);
            result.put("success", true);
            result.put("fallback", true);
            return ResponseEntity.ok(result);
        }
    }
    
    private List<Map<String, Object>> parseAIResponse(String response) {
        List<Map<String, Object>> results = new ArrayList<>();
        try {
            // 提取JSON数组部分
            int start = response.indexOf('[');
            int end = response.lastIndexOf(']');
            if (start >= 0 && end > start) {
                String jsonArray = response.substring(start, end + 1);
                ObjectMapper mapper = new ObjectMapper();
                results = mapper.readValue(jsonArray, new com.fasterxml.jackson.core.type.TypeReference<List<Map<String, Object>>>() {});
            }
        } catch (Exception e) {
            log.warn("解析AI响应失败: {}", e.getMessage());
        }
        return results;
    }

    @PostMapping("/generate-from-extracted")
    public ResponseEntity<Map<String, Object>> generateFromExtracted(@RequestBody Map<String, Object> request) {
        Map<String, Object> result = new HashMap<>();
        List<Map<String, Object>> questions = (List<Map<String, Object>>) request.get("questions");
        if (questions == null || questions.isEmpty()) {
            result.put("error", "未提取到题目");
            return ResponseEntity.badRequest().body(result);
        }

        List<Map<String, Object>> objective = new ArrayList<>();
        List<Map<String, Object>> subjective = new ArrayList<>();

        for (Map<String, Object> q : questions) {
            String type = (String) q.getOrDefault("type", "subjective");
            if ("subjective".equals(type)) {
                subjective.add(q);
            } else {
                objective.add(q);
            }
        }

        QuestionDTO dto = new QuestionDTO();
        dto.setObjectiveQuestions(objective);
        dto.setSubjectiveQuestions(subjective);
        dto.setObjectiveCount(objective.size());
        dto.setSubjectiveCount(subjective.size());
        dto.setTotalCount(objective.size() + subjective.size());

        // 不再同步生成答案和解析，前端可逐个触发重新生成
        String combinedText = "纯题目文档提取";
        saveSectionRecord(combinedText, dto);

        result.put("totalCount", dto.getTotalCount());
        result.put("objectiveCount", dto.getObjectiveCount());
        result.put("subjectiveCount", dto.getSubjectiveCount());
        result.put("success", true);
        return ResponseEntity.ok(result);
    }
    /**
     * AI 文档分析：判断文档类型，提取章节和知识点。
     * 返回 Map: { doc_type, chapters, questions }
     */
    private Map<String, Object> callAiDocumentAnalysis(String text) {
        Map<String, Object> fallback = new HashMap<>();
        fallback.put("doc_type", "theory");
        fallback.put("chapters", Collections.emptyList());
        fallback.put("questions", Collections.emptyList());

        try {
            // 长文档截断，最大 15000 字符
            String truncated = text.length() > 15000 ? text.substring(0, 15000) : text;

            String systemPrompt = "你是一位专业的文档分析助手，请严格按照要求分析文档并输出JSON。";
            String userPrompt = "请判断文档类型：\n" +
                "如果文档绝大部分都是试题、选择题、简答题、答案，判定为【纯题目文档】，输出doc_type:\"question_only\"，chapters和questions为空数组。\n\n" +
                "如果文档包含理论、概念、原理讲解，判定为【理论文档】，执行下面流程：\n" +
                "1. 提取文档所有核心独立知识点；\n" +
                "2. 将相似知识点聚类分组，每组必须是单一主题，禁止将不同主题的知识点混在同一组；\n" +
                "3. 根据分组生成章节，章节名称格式严格为：第一章 xxx、第二章 xxx；\n" +
                "4. 每个章节必须内容独立，章节名称必须准确反映该章节的知识点主题；\n" +
                "5. 禁止将多个不相关的章节合并为一个，禁止章节名称与实际内容不符；\n\n" +
                "输出标准JSON，不要额外解释，不要markdown。\n\n" +
                "输出JSON结构：\n" +
                "{\"doc_type\":\"\",\"chapters\":[{\"chapter_index\":数字,\"chapter_name\":\"第一章 xxx\",\"knowledge_list\":[\"知识点\"]}],\"questions\":[]}\n\n" +
                "文档内容：\n" + truncated;

            String rawResponse = questionService.callAIContent(systemPrompt, userPrompt);
            String json = cleanJson(rawResponse);
            Map<String, Object> parsed = mapper.readValue(json,
                new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});

            if (!parsed.containsKey("doc_type")) {
                parsed.put("doc_type", "theory");
            }
            if (!parsed.containsKey("chapters")) {
                parsed.put("chapters", Collections.emptyList());
            }
            if (!parsed.containsKey("questions")) {
                parsed.put("questions", Collections.emptyList());
            }
            return parsed;
        } catch (Exception e) {
            log.warn("AI 文档分析失败，回退到正则: {}", e.getMessage());
            return fallback;
        }
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

    /** 从章节文本中提取章节名称（第一行） */
    private String extractChapterName(String text) {
        if (text == null || text.isBlank()) return "未命名章节";
        String firstLine = text.split("\\n")[0].trim();
        return firstLine.length() > 30 ? firstLine.substring(0, 30) + "..." : firstLine;
    }

    private boolean detectPureQuestions(String text) {
        var matcher = QUESTION_PATTERN.matcher(text);
        int questionCount = 0;
        while (matcher.find()) {
            questionCount++;
            if (questionCount >= 3) return true;
        }
        return false;
    }

    private static final Pattern OPTION_PATTERN = Pattern.compile(
            "(?m)^\\s*([A-E])[.、)）]\\s*(.+)",
            Pattern.CASE_INSENSITIVE
    );

    private List<Map<String, Object>> extractQuestionsFromText(String text) {
        List<Map<String, Object>> questions = new ArrayList<>();
        var qMatcher = QUESTION_PATTERN.matcher(text);
        var aMatcher = ANSWER_PATTERN.matcher(text);

        List<String> questionTexts = new ArrayList<>();
        List<String> answers = new ArrayList<>();

        while (qMatcher.find()) {
            questionTexts.add(qMatcher.group(2).trim());
        }

        while (aMatcher.find()) {
            answers.add(aMatcher.group(1).trim());
        }

        for (int i = 0; i < questionTexts.size(); i++) {
            Map<String, Object> q = new HashMap<>();
            String qText = questionTexts.get(i);
            q.put("id", UUID.randomUUID().toString());

            // 检测题目中是否包含选项（A. B. C. D.）
            var optMatcher = OPTION_PATTERN.matcher(qText);
            Map<String, String> options = new LinkedHashMap<>();
            String cleanQuestion = qText;

            while (optMatcher.find()) {
                options.put(optMatcher.group(1).toUpperCase(), optMatcher.group(2).trim());
            }

            if (options.size() >= 2) {
                // 客观题：提取选项
                var reMatcher = OPTION_PATTERN.matcher(qText);
                if (reMatcher.find()) {
                    cleanQuestion = qText.substring(0, reMatcher.start()).trim();
                }
                q.put("question", cleanQuestion);
                q.put("options", options);
                String rawAns = i < answers.size() ? answers.get(i) : "";
                String answer = rawAns.replaceAll("[^A-Ea-e]", "").toUpperCase();
                q.put("type", options.size() > 4 || answer.length() > 1 ? "multiple" : "single");
                q.put("answer", answer.isEmpty() ? rawAns : answer);
                q.put("explanation", "");
            } else {
                // 主观题
                q.put("question", qText);
                q.put("type", "subjective");
                q.put("answer", i < answers.size() ? answers.get(i) : "");
                q.put("explanation", "");
            }

            questions.add(q);
        }

        return questions;
    }

    private String extractPdfText(MultipartFile file) throws Exception {
        byte[] bytes = file.getBytes();
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            PDFTextStripper stripper = new PDFTextStripper();
            return stripper.getText(doc);
        }
    }

    private String extractWordText(MultipartFile file) throws Exception {
        byte[] bytes = file.getBytes();
        try (XWPFDocument doc = new XWPFDocument(new ByteArrayInputStream(bytes))) {
            XWPFWordExtractor extractor = new XWPFWordExtractor(doc);
            return extractor.getText();
        }
    }

    private void saveSectionRecord(String text, QuestionDTO dto) {
        try {
            if (jwtAuth != null && questionRecordMapper != null) {
                QuestionRecord record = new QuestionRecord();
                try { record.setUserId(jwtAuth.getCurrentUserId()); } catch (Exception e) { record.setUserId(null); }
                record.setSourceText(text != null && text.length() > 500 ? text.substring(0, 500) : text);
                record.setQuestionsJson(mapper.writeValueAsString(Map.of(
                        "objectiveQuestions", dto.getObjectiveQuestions(),
                        "subjectiveQuestions", dto.getSubjectiveQuestions()
                )));
                record.setQuestionCount(dto.getTotalCount());
                questionRecordMapper.insert(record);
                log.info("章节出题记录已保存: {}题", dto.getTotalCount());
            }
        } catch (Exception e) {
            log.warn("保存章节出题记录失败: {}", e.getMessage());
        }
    }
}