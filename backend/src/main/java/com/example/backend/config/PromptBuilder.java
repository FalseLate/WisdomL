package com.example.backend.config;

import java.util.Map;

public class PromptBuilder {

    private PromptBuilder() {}

    public static Map<String, String> buildPrompts(String text, String questionType) {
        int len = text.replaceAll("^\\s+|\\s+$", "").length();
        Map<String, Integer> counts = QuestionConfig.getCounts(len, questionType);
        int objNum = counts.get("objNum");
        int subNum = counts.get("subNum");

        String system = "你是一名专业的初高中/大学课程出题老师。";

        StringBuilder user = new StringBuilder();
        user.append("请严格根据以下资料出题。\n\n");

        if (objNum > 0) {
            user.append("【客观题要求】共").append(objNum).append("道，包含单选题、多选题，覆盖不同知识点。\n");
            user.append("每题格式：").append("{\"type\":\"single或multiple\",\"question\":\"题目\",")
                .append("\"options\":{\"A\":\"\",\"B\":\"\",\"C\":\"\",\"D\":\"\"},\"answer\":\"正确答案\",\"explanation\":\"详细解析\"}\n\n");
        } else {
            user.append("【客观题】无需出客观题，返回空数组。\n\n");
        }

        if (subNum > 0) {
            user.append("【主观题要求】共").append(subNum).append("道，随机包含名词解释、简答题、论述题，抓重点考点。\n");
            user.append("每题格式：").append("{\"type\":\"subjective\",\"category\":\"名词解释/简答/论述\",")
                .append("\"question\":\"题目\",\"answer\":\"参考答案要点\",\"explanation\":\"答题思路和得分点\"}\n\n");
        } else {
            user.append("【主观题】无需出主观题，返回空数组。\n\n");
        }

        user.append("最终只返回纯JSON，禁止markdown、禁止多余文字，严格返回结构：\n");
        user.append("{\"objectiveQuestions\":[],\"subjectiveQuestions\":[]}\n\n");
        user.append("补充规则：某类题目数量为0时，对应返回空数组。\n\n");
        user.append("资料原文：\n").append(text);

        return Map.of("system", system, "user", user.toString());
    }
}
