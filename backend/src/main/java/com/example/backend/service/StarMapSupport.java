package com.example.backend.service;

/**
 * 星图里前后端必须一致的两个口径，集中放一处：
 * 规范化名（查重与否决键）和掌握度判定，避免控制器与 AI 服务各写一份算出不同的结果。
 */
public final class StarMapSupport {

    private StarMapSupport() {}

    /**
     * 与前端 starmap/graph.js 的 normalizeTitle 同规则：转小写、去空白、去常见中英文标点。
     * 两边算法不一致会让"同名合并"在服务端和客户端得出不同结论，改一处必须同步另一处。
     */
    public static String normalizeTitle(String text) {
        if (text == null) return "";
        return text.toLowerCase()
            .replaceAll("\\s+", "")
            .replaceAll("[（）()【】\\[\\]·、，,。.：:;；!?！？\"'“”_\\-]", "");
    }

    /** 掌握度口径：错题行 status>=2 表示已重做答对（复习中/已掌握），不再算"错" */
    public static boolean stillWrong(Integer status) {
        return status == null || status < 2;
    }
}
