package com.example.backend.entity;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.List;
import java.util.ArrayList;

public class GenerateTask {

    public enum Status {
        PENDING,    // 排队中，还没开始执行
        RUNNING,    // 正在执行，AI在出题
        COMPLETED,  // 完成，结果可以取了
        FAILED      // 失败，有错误信息
    }

    private String taskId;
    private Status status;
    private Long userId;
    private String source;              // 来源：text / file / photo
    private String title;                // 文档标题
    private int totalQuestions;
    private int objectiveCount;
    private int subjectiveCount;
    private String errorMessage;
    private LocalDateTime createdAt;
    private LocalDateTime completedAt;
    private List<Map<String, Object>> objectiveQuestions = new ArrayList<>();
    private List<Map<String, Object>> subjectiveQuestions = new ArrayList<>();

    public GenerateTask() {}

    public GenerateTask(String taskId, Long userId, String source) {
        this.taskId = taskId;
        this.userId = userId;
        this.source = source;
        this.title = "";
        this.status = Status.PENDING;
        this.createdAt = LocalDateTime.now();
    }



    public String getTaskId() { return taskId; }
    public void setTaskId(String taskId) { this.taskId = taskId; }

    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }

    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public int getTotalQuestions() { return totalQuestions; }
    public void setTotalQuestions(int totalQuestions) { this.totalQuestions = totalQuestions; }

    public int getObjectiveCount() { return objectiveCount; }
    public void setObjectiveCount(int objectiveCount) { this.objectiveCount = objectiveCount; }

    public int getSubjectiveCount() { return subjectiveCount; }
    public void setSubjectiveCount(int subjectiveCount) { this.subjectiveCount = subjectiveCount; }

    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getCompletedAt() { return completedAt; }
    public void setCompletedAt(LocalDateTime completedAt) { this.completedAt = completedAt; }

    public List<Map<String, Object>> getObjectiveQuestions() { return objectiveQuestions; }
    public void setObjectiveQuestions(List<Map<String, Object>> objectiveQuestions) { this.objectiveQuestions = objectiveQuestions; }

    public List<Map<String, Object>> getSubjectiveQuestions() { return subjectiveQuestions; }
    public void setSubjectiveQuestions(List<Map<String, Object>> subjectiveQuestions) { this.subjectiveQuestions = subjectiveQuestions; }
}
