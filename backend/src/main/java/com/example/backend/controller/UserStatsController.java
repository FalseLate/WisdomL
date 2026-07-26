package com.example.backend.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.example.backend.auth.JwtAuth;
import com.example.backend.entity.AnswerRecord;
import com.example.backend.entity.Favorite;
import com.example.backend.entity.QuestionRecord;
import com.example.backend.entity.UserWrongQuestion;
import com.example.backend.mapper.AnswerRecordMapper;
import com.example.backend.mapper.FavoriteMapper;
import com.example.backend.mapper.QuestionRecordMapper;
import com.example.backend.mapper.UserWrongQuestionMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class UserStatsController {

    private static final Logger log = LoggerFactory.getLogger(UserStatsController.class);

    @Autowired(required = false)
    private QuestionRecordMapper questionRecordMapper;

    @Autowired(required = false)
    private UserWrongQuestionMapper wrongQuestionMapper;

    @Autowired(required = false)
    private AnswerRecordMapper answerRecordMapper;

    @Autowired(required = false)
    private FavoriteMapper favoriteMapper;

    @Autowired(required = false)
    private JwtAuth jwtAuth;

    @GetMapping("/user-stats")
    public Map<String, Object> stats() {
        Long userId = getCurrentUserId();
        if (userId == null) {
            return Map.of("totalPractices", 0, "totalQuestions", 0, "wrongCount", 0, "collectionCount", 0, "thisMonthPractices", 0);
        }
        long totalRecords = 0;
        if (questionRecordMapper != null) {
            totalRecords = questionRecordMapper.selectCount(
                new LambdaQueryWrapper<QuestionRecord>().eq(QuestionRecord::getUserId, userId));
        }

        long totalQuestions = 0;
        if (answerRecordMapper != null && questionRecordMapper != null) {
            for (QuestionRecord qr : questionRecordMapper.selectList(
                new LambdaQueryWrapper<QuestionRecord>().eq(QuestionRecord::getUserId, userId))) {
                totalQuestions += answerRecordMapper.selectCount(
                    new LambdaQueryWrapper<AnswerRecord>().eq(AnswerRecord::getRecordId, qr.getId()));
            }
        }

        long wrongCount = 0;
        if (wrongQuestionMapper != null) {
            wrongCount = wrongQuestionMapper.selectCount(
                new LambdaQueryWrapper<UserWrongQuestion>()
                    .eq(UserWrongQuestion::getUserId, userId)
                    .eq(UserWrongQuestion::getIsRemoved, 0));
        }

        long collectionCount = 0;
        if (favoriteMapper != null) {
            collectionCount = favoriteMapper.selectCount(
                new LambdaQueryWrapper<Favorite>().eq(Favorite::getUserId, userId));
        }

        LocalDateTime monthStart = LocalDateTime.now().withDayOfMonth(1).withHour(0).withMinute(0).withSecond(0);
        long monthRecords = 0;
        if (questionRecordMapper != null) {
            monthRecords = questionRecordMapper.selectCount(
                new LambdaQueryWrapper<QuestionRecord>()
                    .eq(QuestionRecord::getUserId, userId)
                    .ge(QuestionRecord::getCreateTime, monthStart));
        }

        return Map.of(
            "totalPractices", totalRecords,
            "totalQuestions", totalQuestions,
            "wrongCount", wrongCount,
            "collectionCount", collectionCount,
            "thisMonthPractices", monthRecords
        );
    }

    private Long getCurrentUserId() {
        try {
            return jwtAuth != null ? jwtAuth.getCurrentUserId() : null;
        } catch (Exception e) {
            log.warn("获取用户 ID 失败：{}", e.getMessage());
            return null;
        }
    }
}
