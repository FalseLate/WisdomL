package com.example.backend.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.example.backend.auth.JwtAuth;
import com.example.backend.entity.*;
import com.example.backend.mapper.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import org.springframework.web.multipart.MultipartFile;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.util.*;

@RestController
@RequestMapping("/api/user")
public class UserController {

    @Autowired private JwtAuth jwtAuth;
    @Autowired private UserMapper userMapper;
    @Autowired private QuestionRecordMapper questionRecordMapper;
    @Autowired private AnswerRecordMapper answerRecordMapper;
    @Autowired private FavoriteMapper favoriteMapper;

    private static final Logger log = LoggerFactory.getLogger(UserController.class);

    @GetMapping("/profile")
    public Map<String, Object> profile() {
        Long userId = jwtAuth.getCurrentUserId();
        User user = userMapper.selectById(userId);
        if (user == null) return Map.of("error", "用户不存在");

        long totalRecords = questionRecordMapper.selectCount(
            new LambdaQueryWrapper<QuestionRecord>().eq(QuestionRecord::getUserId, userId));

        long totalAnswers = 0;
        long totalCorrect = 0;
        List<QuestionRecord> allRecords = questionRecordMapper.selectList(
            new LambdaQueryWrapper<QuestionRecord>().eq(QuestionRecord::getUserId, userId));
        for (QuestionRecord qr : allRecords) {
            List<AnswerRecord> answers = answerRecordMapper.selectList(
                new LambdaQueryWrapper<AnswerRecord>().eq(AnswerRecord::getRecordId, qr.getId()));
            totalAnswers += answers.size();
            totalCorrect += answers.stream().filter(a -> a.getIsCorrect() != null && a.getIsCorrect() == 1).count();
        }

        long favCount = favoriteMapper.selectCount(
            new LambdaQueryWrapper<Favorite>().eq(Favorite::getUserId, userId));

        Map<String, Object> result = new HashMap<>();
        result.put("user", Map.of(
            "id", user.getId(),
            "username", user.getUsername(),
            "nickname", user.getNickname() != null ? user.getNickname() : user.getUsername(),
            "avatar", user.getAvatar() != null ? user.getAvatar() : ""
        ));
        result.put("stats", Map.of(
            "totalRecords", totalRecords,
            "totalAnswers", totalAnswers,
            "totalCorrect", totalCorrect,
            "accuracy", totalAnswers > 0 ? Math.round(totalCorrect * 100.0 / totalAnswers) : 0,
            "favCount", favCount
        ));

        return result;
    }

    @GetMapping("/history")
    public List<Map<String, Object>> history() {
        Long userId = jwtAuth.getCurrentUserId();
        List<QuestionRecord> records = questionRecordMapper.selectList(
            new LambdaQueryWrapper<QuestionRecord>()
                .eq(QuestionRecord::getUserId, userId)
                .orderByDesc(QuestionRecord::getCreateTime));

        List<Map<String, Object>> result = new ArrayList<>();
        for (QuestionRecord r : records) {
            Map<String, Object> item = new HashMap<>();
            item.put("id", r.getId());
            String source = r.getSourceText();
            item.put("sourceText", source != null && source.length() > 100 ? source.substring(0, 100) + "..." : source);
            item.put("questionCount", r.getQuestionCount() != null ? r.getQuestionCount() : 0);
            item.put("questionsJson", r.getQuestionsJson());
            item.put("createTime", r.getCreateTime() != null ? r.getCreateTime().toString() : null);
            result.add(item);
        }
        return result;
    }

    @DeleteMapping("/history/{id}")
    public Map<String, Object> deleteHistory(@PathVariable Long id) {
        if (questionRecordMapper != null) {
            questionRecordMapper.deleteById(id);
        }
        return Map.of("success", true);
    }

    @PostMapping("/history/batch-delete")
    public Map<String, Object> batchDeleteHistory(@RequestBody Map<String, Object> body) {
        List<Integer> ids = (List<Integer>) body.get("ids");
        if (ids != null && questionRecordMapper != null) {
            ids.forEach(id -> questionRecordMapper.deleteById(id.longValue()));
        }
        return Map.of("success", true);
    }

    @GetMapping("/wrong-questions")
    public List<Map<String, Object>> wrongQuestions() {
        Long userId = jwtAuth.getCurrentUserId();
        List<QuestionRecord> records = questionRecordMapper.selectList(
            new LambdaQueryWrapper<QuestionRecord>()
                .eq(QuestionRecord::getUserId, userId)
                .orderByDesc(QuestionRecord::getCreateTime));

        List<Map<String, Object>> result = new ArrayList<>();
        for (QuestionRecord qr : records) {
            List<AnswerRecord> wrongAnswers = answerRecordMapper.selectList(
                new LambdaQueryWrapper<AnswerRecord>()
                    .eq(AnswerRecord::getRecordId, qr.getId())
                    .eq(AnswerRecord::getIsCorrect, 0));

            for (AnswerRecord ar : wrongAnswers) {
                Map<String, Object> item = new HashMap<>();
                item.put("recordId", qr.getId());
                item.put("questionIndex", ar.getQuestionIndex() != null ? ar.getQuestionIndex() : 0);
                item.put("userAnswer", ar.getUserAnswer());
                item.put("createTime", ar.getCreateTime() != null ? ar.getCreateTime().toString() : null);
                item.put("questionsJson", qr.getQuestionsJson());
                result.add(item);
            }
        }
        return result;
    }

    @GetMapping("/favorites")
    public List<Map<String, Object>> favorites() {
        Long userId = jwtAuth.getCurrentUserId();
        List<Favorite> favs = favoriteMapper.selectList(
            new LambdaQueryWrapper<Favorite>()
                .eq(Favorite::getUserId, userId)
                .orderByDesc(Favorite::getCreateTime));

        List<Map<String, Object>> result = new ArrayList<>();
        for (Favorite f : favs) {
            Map<String, Object> item = new HashMap<>();
            item.put("id", f.getId());
            item.put("questionJson", f.getQuestionJson());
            item.put("createTime", f.getCreateTime() != null ? f.getCreateTime().toString() : null);
            result.add(item);
        }
        return result;
    }

    @PostMapping("/favorites")
    public Map<String, Object> addFavorite(@RequestBody Map<String, String> body) {
        Long userId = jwtAuth.getCurrentUserId();
        String questionJson = body.get("questionJson");
        if (questionJson == null || questionJson.isEmpty()) {
            return Map.of("error", "题目数据不能为空");
        }

        Favorite existing = favoriteMapper.selectOne(
            new LambdaQueryWrapper<Favorite>()
                .eq(Favorite::getUserId, userId)
                .eq(Favorite::getQuestionJson, questionJson));
        if (existing != null) {
            return Map.of("error", "已收藏过这道题了");
        }

        Favorite fav = new Favorite();
        fav.setUserId(userId);
        fav.setQuestionJson(questionJson);
        favoriteMapper.insert(fav);

        return Map.of("id", fav.getId(), "success", true);
    }

    @DeleteMapping("/favorites/{id}")
    public Map<String, Object> removeFavorite(@PathVariable Long id) {
        Long userId = jwtAuth.getCurrentUserId();
        favoriteMapper.delete(new LambdaQueryWrapper<Favorite>()
            .eq(Favorite::getId, id)
            .eq(Favorite::getUserId, userId));
        return Map.of("success", true);
    }

    @PostMapping("/avatar")
    public Map<String, Object> uploadAvatar(@RequestParam("file") MultipartFile file) {
        Map<String, Object> result = new HashMap<>();
        try {
            String uploadDir = "D:/Reasonix/project/backend/public/avatars";
            java.io.File dir = new java.io.File(uploadDir);
            if (!dir.exists()) dir.mkdirs();

            Long userId = jwtAuth.getCurrentUserId();
            String ext = file.getOriginalFilename();
            ext = ext != null && ext.contains(".") ? ext.substring(ext.lastIndexOf(".")) : ".jpg";
            String fileName = "avatar_" + userId + "_" + System.currentTimeMillis() + ext;
            java.io.File dest = new java.io.File(uploadDir, fileName);
            file.transferTo(dest);

            String avatarUrl = "/avatars/" + fileName;
            User user = userMapper.selectById(userId);
            if (user != null) {
                user.setAvatar(avatarUrl);
                userMapper.updateById(user);
            }

            result.put("url", avatarUrl);
            result.put("success", true);
        } catch (Exception e) {
            log.error("头像上传失败", e);
            result.put("error", "上传失败：" + e.getMessage());
        }
        return result;
    }
}
