package com.example.backend.controller;

import com.example.backend.auth.JwtAuth;
import com.example.backend.dto.QuestionDTO;
import com.example.backend.entity.QuestionRecord;
import com.example.backend.mapper.QuestionRecordMapper;
import com.example.backend.service.QuestionService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api")
public class GenerateController {

    private static final Logger log = LoggerFactory.getLogger(GenerateController.class);
    private static final ObjectMapper mapper = new ObjectMapper();

    @Autowired
    private QuestionService questionService;

    @Autowired(required = false)
    private JwtAuth jwtAuth;

    @Autowired(required = false)
    private QuestionRecordMapper questionRecordMapper;

    @PostMapping("/generate")
    public QuestionDTO generate(@RequestBody Map<String, String> request) {
        String text = request.get("text");
        String questionType = request.getOrDefault("questionType", "all");
        QuestionDTO dto = questionService.generateParallel(text, questionType);
        saveRecord(text, dto);
        return dto;
    }

    private void saveRecord(String sourceText, QuestionDTO dto) {
        try {
            if (jwtAuth != null && questionRecordMapper != null) {
                QuestionRecord record = new QuestionRecord();
                try { record.setUserId(jwtAuth.getCurrentUserId()); } catch (Exception e) { record.setUserId(null); }
                record.setSourceText(sourceText != null && sourceText.length() > 500 ? sourceText.substring(0, 500) : sourceText);
                record.setQuestionsJson(mapper.writeValueAsString(Map.of(
                    "objectiveQuestions", dto.getObjectiveQuestions(),
                    "subjectiveQuestions", dto.getSubjectiveQuestions()
                )));
                record.setQuestionCount(dto.getTotalCount());
                questionRecordMapper.insert(record);
                log.info("出题记录已保存: {}题", dto.getTotalCount());
            }
        } catch (Exception e) {
            log.warn("保存出题记录失败: {}", e.getMessage());
        }
    }
}
