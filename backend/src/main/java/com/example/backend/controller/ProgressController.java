package com.example.backend.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.example.backend.auth.JwtAuth;
import com.example.backend.entity.AnswerRecord;
import com.example.backend.entity.QuestionRecord;
import com.example.backend.mapper.AnswerRecordMapper;
import com.example.backend.mapper.QuestionRecordMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api")
public class ProgressController {

    private static final Logger log = LoggerFactory.getLogger(ProgressController.class);

    @Autowired(required = false)
    private QuestionRecordMapper questionRecordMapper;

    @Autowired(required = false)
    private AnswerRecordMapper answerRecordMapper;

    @Autowired(required = false)
    private JwtAuth jwtAuth;

    @GetMapping("/progress")
    public Map<String, Object> progress(@RequestParam(required = false) Long historyId) {
        Long userId = getCurrentUserId();

        if (questionRecordMapper == null || answerRecordMapper == null)
            return Map.of("totalCount", 0, "completedCount", 0, "correctCount", 0, "wrongCount", 0, "progressPercent", 0);

        QuestionRecord qr = historyId != null ? questionRecordMapper.selectById(historyId) :
            questionRecordMapper.selectOne(new LambdaQueryWrapper<QuestionRecord>()
                .eq(QuestionRecord::getUserId, userId).orderByDesc(QuestionRecord::getCreateTime).last("LIMIT 1"));

        if (qr == null) return Map.of("totalCount", 0, "completedCount", 0, "correctCount", 0, "wrongCount", 0, "progressPercent", 0);

        List<AnswerRecord> answers = answerRecordMapper.selectList(
            new LambdaQueryWrapper<AnswerRecord>().eq(AnswerRecord::getRecordId, qr.getId()));

        int total = qr.getQuestionCount() != null ? qr.getQuestionCount() : 0;
        int done = answers.size();
        int correct = (int) answers.stream().filter(a -> a.getIsCorrect() != null && a.getIsCorrect() == 1).count();
        int wrong = done - correct;
        int pct = total > 0 ? done * 100 / total : 0;

        return Map.of("totalCount", total, "completedCount", done,
            "correctCount", correct, "wrongCount", wrong, "progressPercent", pct);
    }

    private Long getCurrentUserId() {
        if (jwtAuth == null) {
            throw new RuntimeException("未登录");
        }
        return jwtAuth.getCurrentUserId();
    }
}
