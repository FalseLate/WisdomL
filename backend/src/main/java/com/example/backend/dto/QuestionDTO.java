package com.example.backend.dto;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class QuestionDTO {
    private int totalCount;
    private int objectiveCount;
    private int subjectiveCount;
    private List<Map<String, Object>> objectiveQuestions = new ArrayList<>();
    private List<Map<String, Object>> subjectiveQuestions = new ArrayList<>();
    private String textPreview;
    private String errorMessage = "";

    public int getTotalCount() { return totalCount; }
    public void setTotalCount(int totalCount) { this.totalCount = totalCount; }
    public int getObjectiveCount() { return objectiveCount; }
    public void setObjectiveCount(int objectiveCount) { this.objectiveCount = objectiveCount; }
    public int getSubjectiveCount() { return subjectiveCount; }
    public void setSubjectiveCount(int subjectiveCount) { this.subjectiveCount = subjectiveCount; }
    public List<Map<String, Object>> getObjectiveQuestions() { return objectiveQuestions; }
    public void setObjectiveQuestions(List<Map<String, Object>> objectiveQuestions) { this.objectiveQuestions = objectiveQuestions; }
    public List<Map<String, Object>> getSubjectiveQuestions() { return subjectiveQuestions; }
    public void setSubjectiveQuestions(List<Map<String, Object>> subjectiveQuestions) { this.subjectiveQuestions = subjectiveQuestions; }
    public String getTextPreview() { return textPreview; }
    public void setTextPreview(String textPreview) { this.textPreview = textPreview; }
    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
}
