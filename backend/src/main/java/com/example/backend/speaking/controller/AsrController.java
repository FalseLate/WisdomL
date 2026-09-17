package com.example.backend.speaking.controller;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import com.example.backend.speaking.service.AsrService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import reactor.core.publisher.Mono;

import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/unity/ai")
@RequiredArgsConstructor
public class AsrController {

    private final AsrService asrService;

    /** 按住说话录音上传：multipart file → {text: "识别文本"} 或 {error: "..."} */
    @PostMapping(value = "/asr", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Mono<Map<String, String>> asr(@RequestPart("file") MultipartFile file,
                                         @RequestParam(value = "lang", required = false) String lang) {
        try {
            return asrService.transcribe(file.getBytes(), lang)
                    .map(text -> Map.of("text", text))
                    .onErrorResume(e -> {
                        log.error("ASR 失败", e);
                        return Mono.just(Map.of("error", String.valueOf(e.getMessage())));
                    });
        } catch (Exception e) {
            log.error("ASR 读取上传失败", e);
            return Mono.just(Map.of("error", "读取音频失败: " + e.getMessage()));
        }
    }
}
