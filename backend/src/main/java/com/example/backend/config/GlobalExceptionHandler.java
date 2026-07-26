package com.example.backend.config;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<Map<String, Object>> handleRuntime(RuntimeException e) {
        String msg = e.getMessage();
        int status = 500;

        // Token相关 → 401
        if (msg != null && (msg.contains("Token") || msg.contains("未登录") || msg.contains("登录"))) {
            status = 401;
        }
        // OCR连接失败 → 503
        if (msg != null && msg.contains("OCR服务连接失败")) {
            status = 503;
        }

        return ResponseEntity.status(status).body(Map.of(
            "error", msg != null ? msg : "服务器内部错误",
            "status", status
        ));
    }
}
