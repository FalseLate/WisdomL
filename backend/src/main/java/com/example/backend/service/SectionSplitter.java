package com.example.backend.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import java.util.*;
import java.util.regex.Pattern;

@Component
public class SectionSplitter {

    private static final Logger log = LoggerFactory.getLogger(SectionSplitter.class);

    private static final Pattern CHAPTER_PATTERN = Pattern.compile(
            "(?m)^\\s*(?:第\\s*[\\d\\u4e00-\\u9fa5]+\\s*[章节篇部]|Chapter\\s+\\d+|Part\\s+\\d+|\\d+[\\.\\)]\\s*)",
            Pattern.CASE_INSENSITIVE
    );

    private static final int TARGET_SECTION_SIZE = 5000;
    private static final int MIN_SECTION_SIZE = 500;
    private static final int MAX_SECTION_SIZE = 6000;

    public static class Section {
        private String id;
        private String title;
        private String text;
        private int wordCount;

        public Section(String id, String title, String text, int wordCount) {
            this.id = id; this.title = title; this.text = text;
            this.wordCount = wordCount;
        }

        public String getId() { return id; }
        public String getTitle() { return title; }
        public String getText() { return text; }
        public int getWordCount() { return wordCount; }
    }

    public List<Section> split(String text, String fileName) {
        text = text.trim();
        if (text.isEmpty()) return Collections.emptyList();

        var matcher = CHAPTER_PATTERN.matcher(text);
        List<String> chapterTitles = new ArrayList<>();
        List<Integer> chapterPositions = new ArrayList<>();

        while (matcher.find()) {
            String matched = matcher.group().trim();
            chapterTitles.add(matched);
            chapterPositions.add(matcher.start());
        }

        List<Section> sections = new ArrayList<>();

        if (chapterTitles.size() > 1) {
            for (int i = 0; i < chapterTitles.size(); i++) {
                int start = chapterPositions.get(i);
                int end = (i + 1 < chapterTitles.size()) ? chapterPositions.get(i + 1) : text.length();
                String sectionText = text.substring(start, end).trim();
                if (sectionText.length() < MIN_SECTION_SIZE) continue;
                String title = chapterTitles.get(i) + "（" + countChars(sectionText) + "字）";
                sections.add(new Section("sec-" + (i + 1), title, sectionText, countChars(sectionText)));
            }
        } else {
            sections = splitBySize(text);
        }

        return sections;
    }

    private List<Section> splitBySize(String text) {
        List<Section> sections = new ArrayList<>();
        int total = text.length();

        if (total <= MAX_SECTION_SIZE) {
            sections.add(new Section("sec-1", "全文内容（" + countChars(text) + "字）", text, countChars(text)));
            return sections;
        }

        int part = 1;
        int pos = 0;

        while (pos < total) {
            int end = Math.min(pos + TARGET_SECTION_SIZE, total);

            if (end < total) {
                int searchEnd = Math.min(pos + MAX_SECTION_SIZE, total);
                int lastNewline = text.lastIndexOf('\n', searchEnd);
                if (lastNewline > pos + MIN_SECTION_SIZE) {
                    end = lastNewline;
                }
            }

            String chunk = text.substring(pos, end).trim();
            if (chunk.length() < MIN_SECTION_SIZE && pos > 0) {
                sections.get(sections.size() - 1).text += "\n" + chunk;
                sections.get(sections.size() - 1).wordCount = countChars(sections.get(sections.size() - 1).text);
                break;
            }

            String title = "第" + toChinese(part) + "部分（" + countChars(chunk) + "字）";
            sections.add(new Section("sec-" + part, title, chunk, countChars(chunk)));
            part++;
            pos = end;
        }

        return sections;
    }

    private int countChars(String text) {
        return text.replaceAll("[\\s]", "").length();
    }

    private String toChinese(int n) {
        String[] nums = {"零","一","二","三","四","五","六","七","八","九","十"};
        if (n <= 10) return nums[n];
        if (n < 20) return "十" + nums[n - 10];
        if (n < 100) {
            int tens = n / 10;
            int ones = n % 10;
            return nums[tens] + "十" + (ones > 0 ? nums[ones] : "");
        }
        return String.valueOf(n);
    }
}
