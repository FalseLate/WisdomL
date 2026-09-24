package com.example.backend.english.agent;

import jakarta.annotation.Resource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

/**
 * 英语 Agent 生成用的 chat 服务：任何 OpenAI 兼容 /chat/completions 接口都能接
 * （默认跟随 zhipu.*，切 DeepSeek 只改 application.yml 的 ai.chat-* 三行）。
 * 非流式阻塞调用，供错因识别、个性化阅读生成、挖空抽查等结构化 JSON 任务使用；
 * 口语陪练的流式 HarnessAgent 不走这里，互不影响。
 */
@Service
public class AgentChatService {

    @Value("${ai.chat.base-url}")
    private String baseUrl;

    @Value("${ai.chat.api-key}")
    private String apiKey;

    @Value("${ai.chat.model}")
    private String model;

    @Value("${ai.chat.temperature:0.4}")
    private double temperature;

    @Value("${rag.enabled:true}")
    private boolean ragEnabled;

    @Resource
    private RestClient.Builder restClientBuilder;

    /** 长超时的 RestClient：AI 生成整篇短文可能要 1 分钟以上，默认工厂 10s 读超时会掐断 */
    private RestClient chatClient;

    @jakarta.annotation.PostConstruct
    void init() {
        org.springframework.http.client.SimpleClientHttpRequestFactory factory = new org.springframework.http.client.SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10_000);
        factory.setReadTimeout(180_000);
        chatClient = RestClient.builder().requestFactory(factory).build();
    }

    /** Agent 能力是否可用（与 RAG 共用降级总开关） */
    public boolean isAvailable() {
        return ragEnabled;
    }

    /**
     * 阻塞式单轮对话，返回模型文本。
     * @throws IllegalStateException 接口不可用/调用失败（调用方负责降级）
     */
    public String chat(String systemPrompt, String userPrompt, int maxTokens) {
        if (!ragEnabled) {
            throw new IllegalStateException("Agent 已降级关闭（rag.enabled=false）");
        }
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("model", model);
        body.put("messages", List.of(
                Map.of("role", "system", "content", systemPrompt),
                Map.of("role", "user", "content", userPrompt)));
        body.put("temperature", temperature);
        body.put("max_tokens", maxTokens);
        // 智谱 GLM 系列默认开深度思考，非流式结构化任务里白耗 token 且拖慢响应，显式关闭；
        // 其他供应商（DeepSeek 等）不识别该字段会忽略，故仅在智谱端点时注入
        if (baseUrl.contains("bigmodel.cn")) {
            body.put("thinking", Map.of("type", "disabled"));
        }
        Map<?, ?> resp = chatClient
                .post()
                .uri(baseUrl + "/chat/completions")
                .header("Authorization", "Bearer " + apiKey)
                .header("Content-Type", "application/json")
                .body(body)
                .retrieve()
                .body(Map.class);
        if (resp == null) throw new IllegalStateException("chat 接口无响应");
        List<?> choices = (List<?>) resp.get("choices");
        if (choices == null || choices.isEmpty()) throw new IllegalStateException("chat 接口返回为空");
        Map<?, ?> message = (Map<?, ?>) ((Map<?, ?>) choices.get(0)).get("message");
        Object content = message == null ? null : message.get("content");
        if (content == null || content.toString().isBlank()) throw new IllegalStateException("chat 返回内容为空");
        return content.toString();
    }

    /** 从模型输出里抠出第一个 JSON 对象（容错 markdown 包裹、前后缀文字） */
    public static String extractJson(String text) {
        int start = text.indexOf('{');
        int end = text.lastIndexOf('}');
        if (start < 0 || end <= start) throw new IllegalStateException("输出中没有 JSON 对象");
        return text.substring(start, end + 1);
    }
}
