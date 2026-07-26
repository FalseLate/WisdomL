package com.example.backend.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.example.backend.auth.JwtAuth;
import com.example.backend.entity.UserWrongQuestion;
import com.example.backend.mapper.UserWrongQuestionMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api")
public class WrongQuestionController {

    private static final Logger log = LoggerFactory.getLogger(WrongQuestionController.class);

    @Autowired(required = false)
    private UserWrongQuestionMapper wrongQuestionMapper;

    @Autowired(required = false)
    private JwtAuth jwtAuth;

    @GetMapping("/wrong-questions")
    public List<Map<String, Object>> list() {
        if (wrongQuestionMapper == null) return List.of();
        Long userId = getCurrentUserId();
        return wrongQuestionMapper.selectList(
            new LambdaQueryWrapper<UserWrongQuestion>()
                .eq(UserWrongQuestion::getUserId, userId)
                .eq(UserWrongQuestion::getIsRemoved, 0)
                .orderByDesc(UserWrongQuestion::getUpdatedAt)
        ).stream().map(wq -> {
            Map<String, Object> m = new HashMap<>();
            m.put("id", wq.getId());
            m.put("questionId", wq.getQuestionId());
            m.put("questionContent", wq.getQuestionContent());
            m.put("questionType", wq.getQuestionType());
            m.put("userAnswer", wq.getUserAnswer());
            m.put("correctAnswer", wq.getCorrectAnswer());
            m.put("explanation", wq.getExplanation());
            m.put("score", wq.getScore());
            m.put("wrongCount", wq.getWrongCount());
            m.put("createdAt", wq.getCreatedAt() != null ? wq.getCreatedAt().toString() : null);
            return m;
        }).toList();
    }

    @DeleteMapping("/wrong-questions/{id}")
    public Map<String, Object> remove(@PathVariable Long id) {
        if (wrongQuestionMapper != null) {
            wrongQuestionMapper.deleteById(id);  // 硬删除，直接从数据库移除
        }
        return Map.of("success", true);
    }

    @GetMapping("/wrong-questions/count")
    public Map<String, Object> count() {
        Long userId = getCurrentUserId();
        long c = wrongQuestionMapper != null ?
            wrongQuestionMapper.selectCount(
                new LambdaQueryWrapper<UserWrongQuestion>()
                    .eq(UserWrongQuestion::getUserId, userId)
                    .eq(UserWrongQuestion::getIsRemoved, 0)) : 0;
        return Map.of("count", c);
    }

    private Long getCurrentUserId() {
        if (jwtAuth == null) {
            throw new RuntimeException("未登录");
        }
        return jwtAuth.getCurrentUserId();
    }
}
