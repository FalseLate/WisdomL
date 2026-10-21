package com.example.backend.entity;

import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class TaskManager {
    private final ConcurrentHashMap<String,GenerateTask> tasks=new ConcurrentHashMap<>();
    public String createTask(Long userId, String source, String title){
        String taskId= UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        GenerateTask task=new GenerateTask(taskId,userId,source);
        task.setTitle(title != null ? title : "");
        tasks.put(taskId,task);
        return taskId;
    }

    public GenerateTask getTask(String taskId){
        return tasks.get(taskId);
    }

    /** 该用户是否还有没跑完的某类任务：AI 反推入口用它挡住"连点两次" */
    public boolean hasRunningTask(Long userId, String source){
        if (userId == null) return false;
        return tasks.values().stream().anyMatch(t ->
            userId.equals(t.getUserId())
                && (source == null || source.equals(t.getSource()))
                && (t.getStatus() == GenerateTask.Status.PENDING || t.getStatus() == GenerateTask.Status.RUNNING));
    }

    public Map<String,Object> getTaskResult(String taskId){
        GenerateTask task=tasks.get(taskId);
        if (task==null) return null;

        Map<String,Object> result=new LinkedHashMap<>();
        result.put("taskId",task.getTaskId());
        result.put("status",task.getStatus().name().toLowerCase());
        result.put("source",task.getSource());
        result.put("createdAt", task.getCreatedAt() != null ? task.getCreatedAt().toString() : null);

        if (task.getStatus() == GenerateTask.Status.COMPLETED) {
            result.put("totalCount", task.getTotalQuestions());
            result.put("objectiveCount", task.getObjectiveCount());
            result.put("subjectiveCount", task.getSubjectiveCount());
            result.put("objectiveQuestions", task.getObjectiveQuestions());
            result.put("subjectiveQuestions", task.getSubjectiveQuestions());
        }

        // 非出题类任务（星图反推等）自己的产出走这个通用出口；出题任务恒为 null，行为不变
        if (task.getResult() != null) result.put("result", task.getResult());

        if (task.getStatus() == GenerateTask.Status.FAILED) {
            result.put("error", task.getErrorMessage());
        }

        return result;
    }

}
