package com.example.backend.auth;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

@Component
public class JwtAuth {

    @Autowired
    private JwtUtil jwtUtil;

    /** 从请求头中获取当前用户ID */
    public Long getCurrentUserId() {
        var attrs = RequestContextHolder.getRequestAttributes();
        if (attrs == null) {
            throw new RuntimeException("无法获取请求上下文");
        }
        var request = ((ServletRequestAttributes) attrs).getRequest();
        String authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            throw new RuntimeException("未登录");
        }
        String token = authHeader.substring(7);
        if (!jwtUtil.validateToken(token)) {
            throw new RuntimeException("Token无效或已过期");
        }
        return jwtUtil.getUserId(token);
    }
}
