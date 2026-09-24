package com.example.backend.speaking.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.time.Duration;

/**
 * 语音识别转发层：把音频字节 POST 给本地常驻 faster-whisper 服务（asr_server.py, 默认 9010）。
 * 服务未启动/超时都会得到干净的 Mono.error，由上层转成 {error} 响应。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AsrService {

    private final WebClient.Builder webClientBuilder;
    private static final ObjectMapper JSON = new ObjectMapper();

    @Value("${asr.server-url:http://127.0.0.1:9010}")
    private String asrUrl;

    /** 音频字节 → 识别文本 */
    public Mono<String> transcribe(byte[] audio, String language) {
        return webClientBuilder.build().post()
                .uri(asrUrl + "/transcribe")
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header("X-Language", language == null || language.isEmpty() ? "en" : language)
                .bodyValue(audio)
                .retrieve()
                .bodyToMono(String.class)
                .timeout(Duration.ofSeconds(30))
                .map(body -> {
                    try {
                        JsonNode node = JSON.readTree(body);
                        if (node.hasNonNull("error")) {
                            throw new IllegalStateException("ASR 服务报错: " + node.get("error").asText());
                        }
                        return node.path("text").asText("");
                    } catch (IllegalStateException e) {
                        throw e;
                    } catch (Exception e) {
                        throw new RuntimeException("ASR 响应解析失败: " + body, e);
                    }
                });
    }
}
