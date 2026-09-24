package com.example.backend.speaking.controller;

import com.example.backend.speaking.dto.TTSResult;
import com.example.backend.speaking.service.CharacterProfileService;
import com.example.backend.speaking.service.EdgeTtsService;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.File;
import java.io.FileOutputStream;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * 纯 TTS 接口：不走大模型，只把指定文本合成 mp3，供阅读页「虚拟人朗读」使用。
 * 与聊天链路共用 EdgeTtsService 与音频落盘目录（/audio/** 静态映射）。
 */
@Slf4j
@RestController
@RequestMapping("/unity/ai")
public class TtsController {

    @Resource
    private EdgeTtsService edgeTtsService;
    @Resource
    private CharacterProfileService characterProfiles;

    @Value("${tts.audio-dir:/tmp/tts-audio}")
    private String audioDir;

    @Value("${tts.audio-base-url:http://localhost:8080/audio/}")
    private String audioBaseUrl;

    @PostMapping("/tts")
    public Map<String, Object> speak(@RequestBody Map<String, String> param) {
        Map<String, Object> res = new HashMap<>();
        String text = param.get("text");
        if (text == null || text.isBlank()) {
            res.put("code", 400);
            res.put("msg", "text 不能为空");
            return res;
        }
        try {
            // 语音参数与虚拟人对话同一套角色配置；语速允许前端临时覆盖（朗读调速）
            CharacterProfileService.VoiceProfile vp = characterProfiles.resolve(param.get("characterId"));
            String rate = param.get("rate") == null || param.get("rate").isBlank() ? vp.rate() : param.get("rate");
            TTSResult result = edgeTtsService.synthesizeReactive(text, vp.voice(), rate, vp.pitch())
                    .block(Duration.ofSeconds(30));
            if (result == null || result.getAudioData() == null) {
                res.put("code", 500);
                res.put("msg", "语音合成失败");
                return res;
            }
            File dir = new File(audioDir);
            if (!dir.exists()) {
                dir.mkdirs();
            }
            String fileName = UUID.randomUUID() + ".mp3";
            File file = new File(dir, fileName);
            try (FileOutputStream fos = new FileOutputStream(file)) {
                fos.write(result.getAudioData());
            }
            String base = audioBaseUrl.endsWith("/") ? audioBaseUrl : audioBaseUrl + "/";
            Map<String, Object> data = new HashMap<>();
            data.put("audioUrl", base + fileName);
            res.put("code", 200);
            res.put("data", data);
        } catch (Exception e) {
            log.error("TTS 合成异常: {}", text, e);
            res.put("code", 500);
            res.put("msg", "语音合成异常: " + e.getMessage());
        }
        return res;
    }
}
