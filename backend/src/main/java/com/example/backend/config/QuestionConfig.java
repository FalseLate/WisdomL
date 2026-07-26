package com.example.backend.config;

import java.util.Map;

public class QuestionConfig {

    private QuestionConfig() {}

    private static final int[][] TIERS = {
        {   500,   3,  2 },
        {  2000,   6,  4 },
        {  5000,  15,  8 },
        { 10000,  25, 12 },
        { 20000,  40, 20 },
        { 50000,  60, 30 },
        { Integer.MAX_VALUE, 80, 40 },
    };

    public static Map<String, Integer> getCounts(int textLength, String questionType) {
        int objNum = 0, subNum = 0;
        for (int[] tier : TIERS) {
            if (textLength <= tier[0]) {
                objNum = tier[1];
                subNum = tier[2];
                break;
            }
        }

        switch (questionType) {
            case "objective" -> subNum = 0;
            case "subjective" -> objNum = 0;
        }

        return Map.of("objNum", objNum, "subNum", subNum, "total", objNum + subNum);
    }

    public static String getTypeLabel(String type) {
        return switch (type) {
            case "all" -> "全部题型";
            case "objective" -> "仅客观题";
            case "subjective" -> "仅主观题";
            default -> "全部题型";
        };
    }
}
