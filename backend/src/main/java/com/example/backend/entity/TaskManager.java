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

        if (task.getStatus() == GenerateTask.Status.FAILED) {
            result.put("error", task.getErrorMessage());
        }

        return result;
    }

}
