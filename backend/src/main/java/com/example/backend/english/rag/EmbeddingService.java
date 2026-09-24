package com.example.backend.english.rag;

import jakarta.annotation.Resource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

/**
 * 通用 embedding 服务：任何 OpenAI 兼容的 /embeddings 接口都能接（智谱 / 硅基流动 / 阿里百炼…）。
 * 供应商切换只改 application.yml 的 rag.embedding-* 三行，代码不动。
 * rag.enabled=false 时由调用方走降级路径，本类不做开关判断。
 */
@Service
public class EmbeddingService {

    @Value("${rag.embedding-api-key:${zhipu.api-key}}")
    private String apiKey;

    @Value("${rag.embedding-base-url:https://open.bigmodel.cn/api/paas/v4}")
    private String baseUrl;

    @Value("${rag.embedding-model:embedding-3}")
    private String embeddingModel;

    @Resource
    private RestClient.Builder restClientBuilder;

    /** 单条文本向量化，返回向量数组；接口异常向上抛出，由调用方降级 */
    public float[] embed(String text) {
        Map<?, ?> resp = restClientBuilder.build()
                .post()
                .uri(baseUrl + "/embeddings")
                .header("Authorization", "Bearer " + apiKey)
                .header("Content-Type", "application/json")
                .body(Map.of("model", embeddingModel, "input", text))
                .retrieve()
                .body(Map.class);
        if (resp == null) throw new IllegalStateException("embedding 接口无响应");
        List<?> data = (List<?>) resp.get("data");
        if (data == null || data.isEmpty()) throw new IllegalStateException("embedding 接口返回为空");
        List<?> vec = (List<?>) ((Map<?, ?>) data.get(0)).get("embedding");
        float[] result = new float[vec.size()];
        for (int i = 0; i < vec.size(); i++) {
            result[i] = ((Number) vec.get(i)).floatValue();
        }
        return result;
    }
}
