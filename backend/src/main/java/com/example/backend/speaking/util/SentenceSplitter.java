package com.example.backend.speaking.util;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 流式文本切句器：把 LLM 增量输出的 token 拼接、切出完整句子。
 * 规则：遇到 [.!?]（允许后跟收尾引号/括号）且其后是空白时切出一句；
 * 缓冲区超过 320 字符强制整段切出（防止模型不带标点时迟迟不出声）；
 * flush() 吐出结尾不带标点的残句。
 * 已知局限："Mr. Smith" 这类缩写会误切，对口语短句可接受。
 * 非线程安全 —— 每个请求 new 一个实例。
 */
public class SentenceSplitter {

    private static final Pattern SENTENCE_END = Pattern.compile("[.!?][\"')\\]]*\\s");
    private static final int MAX_BUFFER = 320;

    private final StringBuilder buffer = new StringBuilder();

    /** 喂入一个 token 增量，返回本次凑齐的完整句子（可能 0~N 句） */
    public List<String> accept(String chunk) {
        buffer.append(chunk);
        List<String> sentences = new ArrayList<>();
        while (true) {
            Matcher m = SENTENCE_END.matcher(buffer);
            if (m.find()) {
                String sentence = buffer.substring(0, m.end()).trim();
                buffer.delete(0, m.end());
                if (!sentence.isEmpty()) {
                    sentences.add(sentence);
                }
            } else if (buffer.length() >= MAX_BUFFER) {
                sentences.add(buffer.toString().trim());
                buffer.setLength(0);
            } else {
                break;
            }
        }
        return sentences;
    }

    /** 流结束时调用，吐出缓冲区剩余文本（可能为空串） */
    public String flush() {
        String rest = buffer.toString().trim();
        buffer.setLength(0);
        return rest;
    }
}
