package com.example.backend.controller;

import com.example.backend.auth.JwtUtil;
import com.example.backend.entity.User;
import com.example.backend.mapper.UserMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @Autowired
    private UserMapper userMapper;

    @Autowired
    private JwtUtil jwtUtil;

    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    /** 注册 */
    @PostMapping("/register")
    public ResponseEntity<Map<String, Object>> register(@RequestBody Map<String, String> body) {
        Map<String, Object> result = new HashMap<>();
        String username = body.get("username");
        String password = body.get("password");
        String nickname = body.getOrDefault("nickname", username);

        if (username == null || username.trim().isEmpty() ||
            password == null || password.trim().isEmpty()) {
            result.put("error", "用户名和密码不能为空");
            return ResponseEntity.badRequest().body(result);
        }

        if (password.length() < 6) {
            result.put("error", "密码至少6位");
            return ResponseEntity.badRequest().body(result);
        }

        // 检查用户名是否已存在
        User existing = userMapper.selectOne(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<User>()
                        .eq(User::getUsername, username));
        if (existing != null) {
            result.put("error", "用户名已被注册");
            return ResponseEntity.badRequest().body(result);
        }

        // 创建用户
        User user = new User();
        user.setUsername(username);
        user.setPassword(encoder.encode(password));
        user.setNickname(nickname);
        userMapper.insert(user);

        // 生成 token
        String token = jwtUtil.generateToken(user.getId(), user.getUsername());

        result.put("token", token);
        result.put("user", Map.of(
            "id", user.getId(),
            "username", user.getUsername(),
            "nickname", user.getNickname()
        ));
        return ResponseEntity.ok(result);
    }

    /** 登录 */
    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> login(@RequestBody Map<String, String> body) {
        Map<String, Object> result = new HashMap<>();
        String username = body.get("username");
        String password = body.get("password");

        if (username == null || password == null) {
            result.put("error", "请输入用户名和密码");
            return ResponseEntity.badRequest().body(result);
        }

        User user = userMapper.selectOne(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<User>()
                        .eq(User::getUsername, username));
        if (user == null || !encoder.matches(password, user.getPassword())) {
            result.put("error", "用户名或密码错误");
            return ResponseEntity.status(401).body(result);
        }

        String token = jwtUtil.generateToken(user.getId(), user.getUsername());

        result.put("token", token);
        result.put("user", Map.of(
            "id", user.getId(),
            "username", user.getUsername(),
            "nickname", user.getNickname()
        ));
        return ResponseEntity.ok(result);
    }

    /** 获取当前用户信息（需要 token） */
    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> me(@RequestHeader("Authorization") String authHeader) {
        Map<String, Object> result = new HashMap<>();
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            result.put("error", "未登录");
            return ResponseEntity.status(401).body(result);
        }

        String token = authHeader.substring(7);
        if (!jwtUtil.validateToken(token)) {
            result.put("error", "token无效或已过期");
            return ResponseEntity.status(401).body(result);
        }

        Long userId = jwtUtil.getUserId(token);
        User user = userMapper.selectById(userId);
        if (user == null) {
            result.put("error", "用户不存在");
            return ResponseEntity.status(404).body(result);
        }

        result.put("user", Map.of(
            "id", user.getId(),
            "username", user.getUsername(),
            "nickname", user.getNickname()
        ));
        return ResponseEntity.ok(result);
    }
}
