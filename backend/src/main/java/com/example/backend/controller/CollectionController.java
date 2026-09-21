package com.example.backend.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.example.backend.auth.JwtAuth;
import com.example.backend.entity.Favorite;
import com.example.backend.mapper.FavoriteMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api")
public class CollectionController {

    private static final Logger log = LoggerFactory.getLogger(CollectionController.class);

    @Autowired(required = false)
    private FavoriteMapper favoriteMapper;

    @Autowired(required = false)
    private JwtAuth jwtAuth;

    @PostMapping("/collection")
    public Map<String, Object> add(@RequestBody Map<String, String> body) {
        if (favoriteMapper == null) return Map.of("error", "服务不可用");
        String questionJson = body.get("questionJson");
        String questionType = body.getOrDefault("questionType", "single");
        if (questionJson == null || questionJson.isEmpty()) return Map.of("error", "题目数据为空");

        Long userId = getCurrentUserId();

        Favorite exist = favoriteMapper.selectOne(
            new LambdaQueryWrapper<Favorite>()
                .eq(Favorite::getUserId, userId)
                .eq(Favorite::getQuestionJson, questionJson)
                .last("LIMIT 1"));
        if (exist != null) {
            Map<String, Object> dup = new HashMap<>();
            dup.put("id", exist.getId());
            dup.put("success", true);
            dup.put("favorited", true);
            return dup;
        }
        Favorite fav = new Favorite();
        fav.setUserId(userId);
        fav.setQuestionJson(questionJson);
        fav.setQuestionType(questionType);
        favoriteMapper.insert(fav);
        return Map.of("id", fav.getId(), "success", true);
    }

    @DeleteMapping("/collection/{id}")
    public Map<String, Object> remove(@PathVariable Long id) {
        if (favoriteMapper == null) return Map.of("success", false);
        Long userId = getCurrentUserId();
        Favorite fav = favoriteMapper.selectById(id);
        if (fav == null || !userId.equals(fav.getUserId())) {
            return Map.of("success", false, "error", "记录不存在或无权删除");
        }
        favoriteMapper.deleteById(id);
        return Map.of("success", true);
    }

    @GetMapping("/collection")
    public List<Map<String, Object>> list(@RequestParam(required = false) Long userId) {
        if (favoriteMapper == null) return List.of();
        Long actualUserId = userId != null ? userId : getCurrentUserId();
        return favoriteMapper.selectList(
            new LambdaQueryWrapper<Favorite>()
                .eq(Favorite::getUserId, actualUserId)
                .orderByDesc(Favorite::getCreateTime)
        ).stream().map(f -> {
            Map<String, Object> m = new HashMap<>();
            m.put("id", f.getId());
            m.put("questionJson", f.getQuestionJson());
            m.put("questionType", f.getQuestionType() != null ? f.getQuestionType() : "single");
            m.put("createdAt", f.getCreateTime() != null ? f.getCreateTime().toString() : null);
            return m;
        }).toList();
    }

    private Long getCurrentUserId() {
        if (jwtAuth == null) {
            throw new RuntimeException("未登录");
        }
        return jwtAuth.getCurrentUserId();
    }
}
