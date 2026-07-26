package com.example.backend.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

@Service
public class OcrServiceClient {

    private static final Logger log = LoggerFactory.getLogger(OcrServiceClient.class);
    private static final int MAX_RETRIES = 3;
    private static final long MAX_FILE_SIZE = 10 * 1024 * 1024;
    private static final Set<String> ALLOWED_TYPES = Set.of("image/jpeg", "image/png", "image/bmp", "image/tiff", "image/webp");

    @Value("${ocr.service.url}")
    private String ocrServiceUrl;

    private final RestTemplate restTemplate;

    public OcrServiceClient() {
        this.restTemplate = new RestTemplate();
        var rf = restTemplate.getRequestFactory();
        if (rf instanceof org.springframework.http.client.SimpleClientHttpRequestFactory sf) {
            sf.setConnectTimeout((int) Duration.ofSeconds(10).toMillis());
            sf.setReadTimeout((int) Duration.ofSeconds(60).toMillis());
        }
    }

    public Map<String, Object> recognizeText(MultipartFile imageFile) {
        if (imageFile == null || imageFile.isEmpty()) {
            throw new RuntimeException("图片文件为空");
        }
        if (imageFile.getSize() > MAX_FILE_SIZE) {
            throw new RuntimeException("图片大小不能超过 10MB");
        }
        String contentType = imageFile.getContentType();
        if (contentType == null || !ALLOWED_TYPES.contains(contentType.toLowerCase())) {
            throw new RuntimeException("不支持的图片格式，仅支持 JPG/PNG/BMP/TIFF/WebP");
        }

        RuntimeException lastException = null;
        for (int attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                log.info("OCR 识别第{}次, 文件: {}", attempt, imageFile.getOriginalFilename());
                return doRecognize(imageFile);
            } catch (RuntimeException e) {
                lastException = e;
                log.warn("OCR 第{}次识别失败: {}", attempt, e.getMessage());
                if (attempt < MAX_RETRIES) {
                    try { Thread.sleep(1000L * attempt); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
                }
            }
        }
        throw lastException != null ? lastException : new RuntimeException("OCR 识别失败");
    }

    private Map<String, Object> doRecognize(MultipartFile imageFile) {
        try {
            ByteArrayResource resource = new ByteArrayResource(imageFile.getBytes()) {
                @Override
                public String getFilename() {
                    return imageFile.getOriginalFilename();
                }
            };

            MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
            body.add("file", resource);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.MULTIPART_FORM_DATA);

            HttpEntity<MultiValueMap<String, Object>> entity = new HttpEntity<>(body, headers);

            ResponseEntity<Map> response = restTemplate.exchange(
                ocrServiceUrl + "/api/ocr_detect",
                HttpMethod.POST,
                entity,
                Map.class
            );

            Map<String, Object> resBody = response.getBody();
            log.info("OCR 原始响应: {}", resBody);
            if (resBody == null) {
                throw new RuntimeException("OCR 服务返回空响应");
            }

            Object codeObj = resBody.get("code");
            int code = codeObj instanceof Number ? ((Number) codeObj).intValue() : 0;
            if (code != 200) {
                String msg = (String) resBody.getOrDefault("msg", "未知错误");
                throw new RuntimeException("OCR 识别失败: " + msg);
            }

            String text = (String) resBody.getOrDefault("text", "");
            if (text == null || text.trim().isEmpty()) {
                throw new RuntimeException("OCR 未识别到文字内容");
            }

            Map<String, Object> result = new HashMap<>();
            result.put("text", text);
            result.put("visualization", resBody.getOrDefault("visualization", ""));
            result.put("regions", resBody.getOrDefault("regions", null));
            return result;

        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            log.error("OCR 服务连接失败: {}", e.getMessage());
            throw new RuntimeException("OCR 服务连接失败, 请检查 OCR 服务是否正常运行: " + e.getMessage());
        }
    }
}
