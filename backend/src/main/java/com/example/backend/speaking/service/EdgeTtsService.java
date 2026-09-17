package com.example.backend.speaking.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.example.backend.speaking.dto.TTSResult;
import com.example.backend.speaking.dto.VisemeEvent;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Service
public class EdgeTtsService {

    // ========== 常用音色常量 ==========
    public static final String VOICE_ZH_XIAOXIAO = "zh-CN-XiaoxiaoNeural";
    public static final String VOICE_ZH_YUNXI = "zh-CN-YunxiNeural";
    public static final String VOICE_ZH_YUNYANG = "zh-CN-YunyangNeural";
    public static final String VOICE_EN_JENNY = "en-US-JennyNeural";
    public static final String VOICE_EN_GUY = "en-US-GuyNeural";
    public static final String VOICE_EN_ARIA = "en-US-AriaNeural";

    // ========== 配置注入 ==========

    @Value("${proxy.enable:false}")
    private boolean proxyEnable;


    @Value("${proxy.host:127.0.0.1}")
    private String proxyHost;

    @Value("${proxy.port:7897}")
    private int proxyPort;

    @Value("${tts.audio-dir:D:/tts-audio}")
    private String tempDir;

    @Value("${tts.python-path:python}")
    private String pythonPath;

    @Value("${tts.script-path:tts.py}")
    private String scriptPath;

    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * 响应式入口（HarnessChatService 调用的方法）
     */
    public Mono<TTSResult> synthesizeReactive(String text, String voice, String rate, String pitch) {
        return Mono.fromCallable(() -> synthesizeBlocking(text, voice, rate, pitch))
                .subscribeOn(Schedulers.boundedElastic());
    }

    /**
     * 核心合成逻辑：调用 Python edge-tts 脚本
     */
    private TTSResult synthesizeBlocking(String text, String voice, String rate, String pitch) throws Exception {
        // 1. 准备临时文件目录
        Path dir = Paths.get(tempDir);
        if (!Files.exists(dir)) {
            Files.createDirectories(dir);
        }
        String uuid = UUID.randomUUID().toString();
        Path textFile = dir.resolve(uuid + ".txt");
        Path mp3File = dir.resolve(uuid + ".mp3");
        Path visemeFile = dir.resolve(uuid + ".json");

        try {
            // 2. 把文本写到临时文件（避免命令行转义问题）
            Files.writeString(textFile, text, StandardCharsets.UTF_8);

            // 3. 构建命令：python tts.py 文本文件 音色 语速 音高 mp3路径 viseme路径
            List<String> command = new ArrayList<>();
            command.add(pythonPath);
            command.add(scriptPath);
            command.add(textFile.toString());
            command.add(voice != null ? voice : VOICE_EN_JENNY);
            command.add(rate != null && !rate.isEmpty() ? rate : "+0%");
            command.add(pitch != null && !pitch.isEmpty() ? pitch : "+0Hz");
            command.add(mp3File.toString());
            command.add(visemeFile.toString());

            System.out.println("=== 调用 edge-tts ===");
            System.out.println("命令: " + String.join(" ", command));

            // 4. 启动进程
            ProcessBuilder pb = new ProcessBuilder(command);
            Map<String, String> env = pb.environment();

            // 只有 proxy.enable=true 时才注入代理环境变量
            if (proxyEnable) {
                String proxyUrl = String.format("http://%s:%d", proxyHost, proxyPort);
                env.put("HTTP_PROXY", proxyUrl);
                env.put("HTTPS_PROXY", proxyUrl);
                env.put("ALL_PROXY", proxyUrl);
                System.out.println("代理已启用: " + proxyUrl);
            } else {
                System.out.println("代理未启用，直连微软 Edge TTS");
            }

            pb.redirectErrorStream(true);
            Process process = pb.start();

            // 5. 读取进程输出（方便排查）
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int len;
            while ((len = process.getInputStream().read(buffer)) != -1) {
                output.write(buffer, 0, len);
            }

            // 6. 等待完成，最多 60 秒
            boolean finished = process.waitFor(60, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                throw new RuntimeException("edge-tts 超时（超过60秒）");
            }

            String outputStr = output.toString(StandardCharsets.UTF_8);
            System.out.println("=== edge-tts 输出 ===");
            System.out.println(outputStr);

            if (process.exitValue() != 0) {
                throw new RuntimeException("edge-tts 执行失败，退出码=" + process.exitValue()
                        + "，输出: " + outputStr);
            }

            // 7. 读取生成的 mp3
            byte[] audioData = Files.readAllBytes(mp3File);
            System.out.println("=== 音频生成成功 ===");
            System.out.println("音频大小: " + audioData.length + " 字节");

            // 8. 读取 viseme JSON，转成 List<VisemeEvent>
            List<VisemeEvent> visemeList = new ArrayList<>();
            if (Files.exists(visemeFile)) {
                String visemeJson = Files.readString(visemeFile, StandardCharsets.UTF_8);
                List<Map<String, Object>> rawList = objectMapper.readValue(
                        visemeJson, new TypeReference<List<Map<String, Object>>>() {});

                for (Map<String, Object> item : rawList) {
                    VisemeEvent event = new VisemeEvent();
                    event.setVisemeId(((Number) item.get("visemeId")).intValue());
                    // ✅ tts.py 输出的已经是毫秒，直接用，不要再除10！
                    event.setOffset(((Number) item.get("offset")).longValue());
                    event.setDuration(((Number) item.get("duration")).longValue());
                    visemeList.add(event);
                }
                System.out.println("viseme 数量: " + visemeList.size());
            }

            // 9. 封装结果
            TTSResult result = new TTSResult();
            result.setAudioData(audioData);
            result.setViseme(visemeList);
            return result;

        } finally {
            // 10. 清理临时文件
            Files.deleteIfExists(textFile);
            Files.deleteIfExists(mp3File);
            Files.deleteIfExists(visemeFile);
        }
    }
}
