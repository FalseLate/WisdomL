package com.example.backend.speaking.service;


import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import com.example.backend.speaking.dto.UnityChatDTO;
import com.example.backend.speaking.util.SentenceSplitter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Sinks;

import java.io.File;
import java.io.FileOutputStream;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

@Slf4j
@Service
@RequiredArgsConstructor
public class HarnessChatService {

    private final EdgeTtsService edgeTtsService;
    private final CharacterProfileService characterProfiles;
    private final LlmService llmService;

    @Value("${tts.audio-dir:/tmp/tts-audio}")
    private String audioDir;

    @Value("${tts.audio-base-url:http://localhost:8080/audio/}")
    private String audioBaseUrl;

    private static final ObjectMapper SSE_JSON = new ObjectMapper();

    /**
     * 流式对话（SSE）：token 增量实时下发用于上屏；
     * 每凑齐一句后台发起 TTS，合成完推一条 audio 事件（带 sentenceIndex，前端按序排队播放）。
     * 事件协议：delta 文字增量 / audio 句子音频就绪 / done 全文结束 / error 错误。
     */
    public Flux<ServerSentEvent<String>> chatStream(UnityChatDTO dto) {
        long start = System.currentTimeMillis();
        String sessionId = dto.getSessionId();
        // 角色档案 → 音色三参数（characterId 缺省落 Jenny）
        final CharacterProfileService.VoiceProfile vp = characterProfiles.resolve(dto.getCharacterId());
        StringBuilder fullText = new StringBuilder();
        SentenceSplitter splitter = new SentenceSplitter();
        AtomicLong sentenceIdx = new AtomicLong();
        Sinks.Many<ServerSentEvent<String>> audioSink = Sinks.many().unicast(



        ).onBackpressureBuffer();
        // 全部 TTS 结束后才关闭 sink：防止迟到的 audio 事件被丢弃
        // （此前 textFlux 一完成就关 sink，句子级 TTS 还在异步跑，事件全部丢失）
        AtomicBoolean textCompleted = new AtomicBoolean(false);
        AtomicInteger pendingTts = new AtomicInteger(0);
        Runnable maybeCompleteSink = () -> {
            if (textCompleted.get() && pendingTts.get() == 0) {
                audioSink.tryEmitComplete();
            }
        };

        Flux<String> chunkFlux;
        if (Boolean.TRUE.equals(dto.getMockMode())) {
            chunkFlux = Flux.just("Hello! Nice to talk with you. How are you today?");
        } else {
            // LlmService 按 mode 路由：chat→有状态口语 Agent，translate→无状态翻译调用
            chunkFlux = llmService.chatStream(dto);
        }
        // mock 模式保留 TTS（调试链路用）；translate 模式只出文字，不朗读不驱动虚拟人
        final boolean ttsOn = Boolean.TRUE.equals(dto.getMockMode())
                || llmService.ttsEnabled(dto.getMode());

        Flux<ServerSentEvent<String>> textFlux = chunkFlux
                .filter(s -> !s.isEmpty())
                .doOnNext(fullText::append)
                .concatMap(chunk -> {
                    if (ttsOn) {
                        for (String sentence : splitter.accept(chunk)) {
                            synthesizeToSink(sentence, sessionId, sentenceIdx.getAndIncrement(), audioSink, pendingTts, maybeCompleteSink, vp);
                        }
                    }
                    return Flux.just(sse("delta", Map.of("text", chunk)));
                })
                .concatWith(Flux.defer(() -> {
                    if (ttsOn) {
                        String tail = splitter.flush();
                        if (!tail.isEmpty()) {
                            synthesizeToSink(tail, sessionId, sentenceIdx.getAndIncrement(), audioSink, pendingTts, maybeCompleteSink, vp);
                        }
                    }
                    return Flux.just(sse("done", Map.of(
                            "fullText", fullText.toString(),
                            "costMs", System.currentTimeMillis() - start)));
                }))
                .onErrorResume(e -> {
                    log.error("流式链路失败, sessionId={}", sessionId, e);
                    return Flux.just(sse("error", Map.of("message", String.valueOf(e.getMessage()))));
                })
                .doFinally(sig -> {
                    textCompleted.set(true);
                    maybeCompleteSink.run();
                });

        return Flux.merge(textFlux, audioSink.asFlux());
    }

    /** 单句 TTS（fire-and-forget 到 boundedElastic）：完成推 audio 事件，失败推 error 事件但不中断整条流 */
    private void synthesizeToSink(String sentence, String sessionId, long index,
                                  Sinks.Many<ServerSentEvent<String>> sink,
                                  AtomicInteger pendingTts, Runnable maybeCompleteSink,
                                  CharacterProfileService.VoiceProfile vp) {
        pendingTts.incrementAndGet();
        edgeTtsService.synthesizeReactive(sentence, vp.voice(), vp.rate(), vp.pitch())
                .subscribe(
                        result -> {
                            sink.tryEmitNext(sse("audio", Map.of(
                                    "sentenceIndex", index,
                                    "text", sentence,
                                    "audioUrl", saveAudio(result.getAudioData()),
                                    "viseme", result.getViseme())));
                            pendingTts.decrementAndGet();
                            maybeCompleteSink.run();
                        },
                        err -> {
                            log.error("句子 TTS 失败, sessionId={}, index={}", sessionId, index, err);
                            sink.tryEmitNext(sse("error", Map.of(
                                    "sentenceIndex", index,
                                    "message", String.valueOf(err.getMessage()))));
                            pendingTts.decrementAndGet();
                            maybeCompleteSink.run();
                        });
    }

    private ServerSentEvent<String> sse(String type, Map<String, ?> data) {
        try {
            return ServerSentEvent.<String>builder(SSE_JSON.writeValueAsString(data)).event(type).build();
        } catch (Exception e) {
            return ServerSentEvent.<String>builder("{\"message\":\"json serialize failed\"}")
                    .event("error").build();
        }
    }

    /**
     * 保存 mp3 到本地目录，返回可访问的 URL
     */
    private String saveAudio(byte[] audioData) {
        try {
            File dir = new File(audioDir);
            if (!dir.exists()) {
                dir.mkdirs();
            }
            String fileName = UUID.randomUUID().toString() + ".mp3";
            File file = new File(dir, fileName);
            try (FileOutputStream fos = new FileOutputStream(file)) {
                fos.write(audioData);
            }
            // ✅ 确保 base url 末尾有 /，避免拼成 /audioxxx.mp3
            String base = audioBaseUrl.endsWith("/") ? audioBaseUrl : audioBaseUrl + "/";
            String audioUrl = base + fileName;
            log.info("音频已保存: {}, 访问URL: {}", file.getAbsolutePath(), audioUrl);
            return audioUrl;
        } catch (Exception e) {
            log.error("保存音频文件失败", e);
            return "";
        }
    }

}
