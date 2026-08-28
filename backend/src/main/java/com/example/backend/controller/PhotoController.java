package com.example.backend.controller;

import com.example.backend.auth.JwtAuth;
import com.example.backend.dto.QuestionDTO;
import com.example.backend.entity.QuestionRecord;
import com.example.backend.entity.GenerateTask;
import com.example.backend.entity.TaskManager;
import com.example.backend.mapper.QuestionRecordMapper;
import com.example.backend.service.OcrServiceClient;
import com.example.backend.service.QuestionService;
import com.example.backend.service.AsyncGenerateService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.*;

@RestController
@RequestMapping("/api")
public class PhotoController {

    private static final Logger log = LoggerFactory.getLogger(PhotoController.class);

    @Autowired
    private OcrServiceClient ocrServiceClient;

    @Autowired
    private QuestionService questionService;

    @Autowired(required = false)
    private JwtAuth jwtAuth;

    @Autowired(required = false)
    private QuestionRecordMapper questionRecordMapper;

    @Autowired
    private TaskManager taskManager;

    @Autowired
    private AsyncGenerateService asyncService;

    private static final ObjectMapper mapper = new ObjectMapper();

    /** 拍照出题：OCR识别 + AI生成题目 */
    @PostMapping("/photo-and-generate")
    public ResponseEntity<Map<String, Object>> photoAndGenerate(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "questionType", defaultValue = "all") String questionType) {

        Map<String, Object> result = new HashMap<>();

        // 1. 校验文件
        if (file == null || file.isEmpty()) {
            result.put("error", "请上传图片文件");
            return ResponseEntity.badRequest().body(result);
        }

        String contentType = file.getContentType();
        if (contentType == null || !contentType.startsWith("image/")) {
            result.put("error", "仅支持图片格式（jpg、png等）");
            return ResponseEntity.badRequest().body(result);
        }

        try {
            // 2. OCR 识别
            log.info("开始OCR识别: {}", file.getOriginalFilename());
            Map<String, Object> ocrResult = ocrServiceClient.recognizeText(file);

            String recognizedText = (String) ocrResult.get("text");
            String visualization = (String) ocrResult.get("visualization");
            List<Map<String, Object>> regions = (List<Map<String, Object>>) ocrResult.get("regions");

            if (recognizedText == null || recognizedText.trim().length() < 10) {
                result.put("error", "图片中未检测到足够文字，请拍摄清晰的文字内容");
                return ResponseEntity.badRequest().body(result);
            }

            // 3. 生成题目
            QuestionDTO dto = questionService.generateParallel(recognizedText, questionType);

            // 4. 组装返回
            result.put("totalCount", dto.getTotalCount());
            result.put("objectiveCount", dto.getObjectiveCount());
            result.put("subjectiveCount", dto.getSubjectiveCount());
            result.put("objectiveQuestions", dto.getObjectiveQuestions());
            result.put("subjectiveQuestions", dto.getSubjectiveQuestions());
            result.put("textPreview", dto.getTextPreview());
            result.put("visualization", visualization != null ? visualization : "");

            // 版面区域信息
            if (regions != null) {
                result.put("regionCount", regions.size());
                result.put("regions", regions);
            }

                        saveOcrRecord(recognizedText, dto);

            return ResponseEntity.ok(result);

        } catch (RuntimeException e) {
            log.error("拍照出题失败: {}", e.getMessage());
            result.put("error", e.getMessage());
            return ResponseEntity.status(503).body(result);
        } catch (Exception e) {
            log.error("拍照出题异常", e);
            result.put("error", "系统异常: " + e.getMessage());
            return ResponseEntity.status(500).body(result);
        }
    }
    
    @PostMapping("/photo-and-generate-async")
    public ResponseEntity<Map<String, Object>> photoAndGenerateAsync(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "questionType", defaultValue = "all") String questionType) {
        if (file == null || file.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "请上传图片"));
        }
        String contentType = file.getContentType();
        if (contentType == null || !contentType.startsWith("image/")) {
            return ResponseEntity.badRequest().body(Map.of("error", "仅支持图片格式"));
        }
        Long userId = null;
        try { userId = jwtAuth.getCurrentUserId(); } catch (Exception e) { }
        String taskId = taskManager.createTask(userId, "photo", file.getOriginalFilename());
        try {
            Map<String, Object> ocrResult = ocrServiceClient.recognizeText(file);
            String recognizedText = (String) ocrResult.get("text");
            if (recognizedText == null || recognizedText.trim().length() < 10) {
                GenerateTask task = taskManager.getTask(taskId);
                if (task != null) { task.setStatus(GenerateTask.Status.FAILED); task.setErrorMessage("图片中未检测到足够文字"); }
            } else {
                asyncService.generateFromText(taskId, recognizedText, questionType);
            }
        } catch (Exception e) {
            GenerateTask task = taskManager.getTask(taskId);
            if (task != null) { task.setStatus(GenerateTask.Status.FAILED); task.setErrorMessage("OCR识别失败: " + e.getMessage()); }
        }
        Map<String, Object> result = new HashMap<>();
        result.put("taskId", taskId);
        result.put("status", "pending");
        return ResponseEntity.ok(result);
    }

    private void saveOcrRecord(String text, QuestionDTO dto) {
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
                log.info("OCR出题记录已保存: {}题", dto.getTotalCount());
            }
        } catch (Exception e) {
            log.warn("保存OCR出题记录失败: {}", e.getMessage());
        }
    }
}
