package com.example.backend.config;

import java.util.List;
import java.util.Map;

/**
 * 知识星图的提示词工厂。
 * 与 PromptBuilder（文生题）刻意分开：那边的 user 串尾部固定拼"资料原文"，
 * 任何混改都会污染出题链路，而且知识点反推的输入是错题而不是资料。
 */
public class StarMapPrompt {

    private StarMapPrompt() {}

    /** 单题反推知识点：一次只处理一道题，失败互不影响 */
    public static Map<String, String> buildPointPrompt(String questionText, String optionsText, String userAnswer,
                                                       String correctAnswer, String explanation, String errorTypes,
                                                       String errorNote, List<String> existingTitles) {
        String system = "你是一位带学生复盘错题的老师。学生做错了这道题，说明有一块具体知识没掌握清楚。"
            + "你的任务是根据错题证据，反推出他没掌握的知识，并用一段约100字的连续讲解把这块知识讲清楚，让他看完能补上这个漏洞。";

        StringBuilder user = new StringBuilder();
        user.append("题干：").append(cut(questionText, 600)).append('\n');
        if (optionsText != null && !optionsText.isBlank()) {
            user.append("选项：").append(cut(optionsText, 400)).append('\n');
        }
        user.append("学生答案：").append(nvl(userAnswer)).append("　正确答案：").append(nvl(correctAnswer)).append('\n');
        if (explanation != null && !explanation.isBlank()) {
            user.append("解析：").append(cut(explanation, 400)).append('\n');
        }
        if (errorTypes != null && !errorTypes.isBlank()) {
            user.append("学生自标错因：").append(errorTypes).append('\n');
        }
        if (errorNote != null && !errorNote.isBlank()) {
            user.append("学生的反思记录：").append(cut(errorNote, 200)).append('\n');
        }

        if (existingTitles != null && !existingTitles.isEmpty()) {
            user.append("\n【已有知识点清单】优先复用下面的名字，写法保持一致；确实不在清单里才新起一个：\n");
            user.append(String.join("、", existingTitles)).append('\n');
        }

        user.append("\n要求：\n");
        user.append("1. 只提炼 2~5 个知识点，宁少勿滥；不要写“认真审题”“多练习”这类不是知识点的话。\n");
        user.append("2. 每个名字不超过 20 个字，用名词短语，不要带“的用法”“知识点”这类后缀。\n");
        user.append("3. 每个知识点配一段约 100 字的连续讲解：它是什么、关键条件或区别、这道题怎么用到它、最容易错在哪。不要分点、不要 markdown，直接写成一段可读的笔记。\n");
        user.append("4. 讲解要针对“学生没掌握的那块知识”，不是复述题目答案；如果已有清单里有合适的名字就复用。\n");
        user.append("5. 忽略界面、账号、展示、按钮、题目编号等非学科元信息；不要把“展示账号”这类测试数据当成知识点。\n");
        user.append("6. 只返回纯 JSON，禁止 markdown、禁止多余文字，结构严格为：\n");
        user.append("{\"points\":[{\"title\":\"知识点名\",\"note\":\"约100字连续讲解\",\"conf\":0.0到1.0}]}\n");
        user.append("conf 是你判断“这个知识点确实是这道错题暴露的薄弱点”的把握，0~1；它只是模型自评，不是准确率。\n");

        return Map.of("system", system, "user", user.toString());
    }

    private static String nvl(String s) { return s == null || s.isBlank() ? "（无）" : s; }

    private static String cut(String s, int max) {
        if (s == null) return "";
        String t = s.trim();
        return t.length() <= max ? t : t.substring(0, max) + "…";
    }
}
