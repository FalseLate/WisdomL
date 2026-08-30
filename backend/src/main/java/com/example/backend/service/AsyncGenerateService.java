package com.example.backend.service;

import com.example.backend.dto.QuestionDTO;
import com.example.backend.entity.GenerateTask;
import com.example.backend.entity.TaskManager;
import com.example.backend.auth.JwtAuth;
import com.example.backend.entity.QuestionRecord;
import com.example.backend.mapper.QuestionRecordMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;


@Service
public class AsyncGenerateService {
    private static final Logger log = LoggerFactory.getLogger(AsyncGenerateService.class);

    @Autowired
    QuestionService questionService;
    @Autowired
    TaskManager taskManager;
    @Autowired(required = false)
    JwtAuth jwtAuth;
    @Autowired(required = false)
    QuestionRecordMapper questionRecordMapper;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /** 保存出题记录到数据库 */
    private void saveRecord(Long userId, String title, String sourceText, QuestionDTO dto) {
        try {
            if (jwtAuth != null && questionRecordMapper != null) {
                QuestionRecord record = new QuestionRecord();
                record.setUserId(userId);
                record.setTitle(title != null ? title : "");
                record.setSourceText(sourceText != null && sourceText.length() > 500 ? sourceText.substring(0, 500) : sourceText);
                record.setQuestionsJson(objectMapper.writeValueAsString(new HashMap<String, Object>() {{
                    put("objectiveQuestions", dto.getObjectiveQuestions());
                    put("subjectiveQuestions", dto.getSubjectiveQuestions());
                }}));
                record.setQuestionCount(dto.getTotalCount());
                questionRecordMapper.insert(record);
                log.info("[异步出题] 记录已保存: {}题", dto.getTotalCount());
            }
        } catch (Exception e) {
            log.warn("[异步出题] 保存记录失败: {}", e.getMessage());
        }
    }

    @Async("generateExecutor")
    public void generateFromText(String taskId,String text,String questionType){
        GenerateTask task=taskManager.getTask(taskId);
        if (task==null) return;

        task.setStatus(GenerateTask.Status.RUNNING);
        log.info("[异步出题] 任务 {} 开始，线程: {}", taskId, Thread.currentThread().getName());
        try {
            // ★ 核心：复用已有的同步出题逻辑，不重复写 ★
            QuestionDTO dto = questionService.generateParallel(text, questionType);

            // 把结果写回任务对象
            task.setObjectiveQuestions(dto.getObjectiveQuestions());
            task.setSubjectiveQuestions(dto.getSubjectiveQuestions());
            task.setObjectiveCount(dto.getObjectiveCount());
            task.setSubjectiveCount(dto.getSubjectiveCount());
            task.setTotalQuestions(dto.getTotalCount());
            task.setStatus(GenerateTask.Status.COMPLETED);
            task.setCompletedAt(LocalDateTime.now());

            log.info("[异步出题] 任务 {} 完成，客观{}题 + 主观{}题",
                    taskId, dto.getObjectiveCount(), dto.getSubjectiveCount());

            saveRecord(task.getUserId(), task.getTitle(), text, dto);

        } catch (Exception e) {
            log.error("[异步出题] 任务 {} 失败: {}", taskId, e.getMessage());
            task.setStatus(GenerateTask.Status.FAILED);
            task.setErrorMessage("出题失败: " + e.getMessage());

    }

    }




    @Async("generateExecutor")
    public void generateFromSections(String taskId, List<String> sectionIds,
                                     Map<String, String> sectionTexts,
                                     String questionType) {
        GenerateTask task = taskManager.getTask(taskId);
        if (task == null) return;

        task.setStatus(GenerateTask.Status.RUNNING);
        log.info("[异步出题] 任务 {} 开始（章节模式），章节数: {}", taskId, sectionIds.size());

        try {
            List<Map<String, Object>> allObj = new ArrayList<>();
            List<Map<String, Object>> allSub = new ArrayList<>();
            int totalObj = 0, totalSub = 0;

            for (String id : sectionIds) {
                String t = sectionTexts.get(id);
                if (t == null || t.trim().isEmpty()) continue;

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

                allObj.addAll(dto.getObjectiveQuestions());
                allSub.addAll(dto.getSubjectiveQuestions());
                totalObj += dto.getObjectiveCount();
                totalSub += dto.getSubjectiveCount();
            }

            task.setObjectiveQuestions(allObj);
            task.setSubjectiveQuestions(allSub);
            task.setObjectiveCount(totalObj);
            task.setSubjectiveCount(totalSub);
            task.setTotalQuestions(totalObj + totalSub);
            task.setStatus(GenerateTask.Status.COMPLETED);
            task.setCompletedAt(LocalDateTime.now());

            // 保存到数据库（拼接所有章节文本作为sourceText）
            StringBuilder allText = new StringBuilder();
            for (String id : sectionIds) {
                String t = sectionTexts.get(id);
                if (t != null && !t.isBlank()) {
                    allText.append(t).append("\n");
                }
            }
            QuestionDTO combinedDto = new QuestionDTO();
            combinedDto.setObjectiveQuestions(allObj);
            combinedDto.setSubjectiveQuestions(allSub);
            combinedDto.setObjectiveCount(totalObj);
            combinedDto.setSubjectiveCount(totalSub);
            combinedDto.setTotalCount(totalObj + totalSub);
            saveRecord(task.getUserId(), task.getTitle(), allText.toString(), combinedDto);

        } catch (Exception e) {
            log.error("[异步出题] 任务 {} 失败: {}", taskId, e.getMessage());
            task.setStatus(GenerateTask.Status.FAILED);
            task.setErrorMessage("章节出题失败: " + e.getMessage());
        }
    }

    /** 从章节文本第一行提取章节名 */
    private String extractChapterName(String text) {
        if (text == null || text.isBlank()) return "未命名章节";
        String firstLine = text.split("\\n")[0].trim();
        return firstLine.length() > 30 ? firstLine.substring(0, 30) + "..." : firstLine;
    }
}
