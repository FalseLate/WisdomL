package com.example.backend.english.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.backend.auth.JwtAuth;
import com.example.backend.english.entity.EnglishWrongExt;
import com.example.backend.english.mapper.EnglishWrongExtMapper;
import com.example.backend.entity.UserWrongQuestion;
import com.example.backend.mapper.UserWrongQuestionMapper;
import jakarta.annotation.Resource;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;

/**
 * 英语错题复习（PDCA 阶段0）：
 * 错题正文只读 user_wrong_question（falselate 的错题本，只 SELECT 不改结构与代码），
 * 错因 / 重做 / 回流等英语学情数据全部落自己的 english_wrong_ext 扩展表。
 */
@RestController
@RequestMapping("/api/english/wrong")
public class EnglishWrongController {

    /** 英语错题的 question_id 前缀：目前英语自己的错题只有阅读题来源 */
    private static final String ENGLISH_PREFIX = "reading-";

    @Resource
    private JwtAuth jwtAuth;
    @Resource
    private UserWrongQuestionMapper wrongQuestionMapper;
    @Resource
    private EnglishWrongExtMapper extMapper;

    /** 英语错题列表：正文（只读）+ 我的扩展字段合并返回 */
    @GetMapping("/list")
    public Map<String, Object> list() {
        Map<String, Object> res = new HashMap<>();
        Long userId = jwtAuth.getCurrentUserId();

        // 只取英语来源的错题行（question_id 以 reading- 开头），未移除的
        List<UserWrongQuestion> rows = wrongQuestionMapper.selectList(
                new LambdaQueryWrapper<UserWrongQuestion>()
                        .eq(UserWrongQuestion::getUserId, userId)
                        .eq(UserWrongQuestion::getIsRemoved, 0)
                        .likeRight(UserWrongQuestion::getQuestionId, ENGLISH_PREFIX)
                        .orderByDesc(UserWrongQuestion::getUpdatedAt));

        // 我的扩展表按 questionId 建索引
        Map<String, EnglishWrongExt> extMap = new HashMap<>();
        for (EnglishWrongExt ext : extMapper.selectList(
                Wrappers.<EnglishWrongExt>lambdaQuery().eq(EnglishWrongExt::getUserId, userId))) {
            extMap.put(ext.getQuestionId(), ext);
        }

        List<Map<String, Object>> data = new ArrayList<>();
        for (UserWrongQuestion row : rows) {
            Map<String, Object> m = new HashMap<>();
            m.put("questionId", row.getQuestionId());
            m.put("questionContent", row.getQuestionContent());
            m.put("questionType", row.getQuestionType());
            m.put("userAnswer", row.getUserAnswer());
            m.put("correctAnswer", row.getCorrectAnswer());
            m.put("explanation", row.getExplanation());
            m.put("wrongCount", row.getWrongCount());
            EnglishWrongExt ext = extMap.get(row.getQuestionId());
            m.put("errorTypeIds", ext != null ? ext.getErrorTypeIds() : null);
            m.put("redoCount", ext != null && ext.getRedoCount() != null ? ext.getRedoCount() : 0);
            m.put("backflowFlag", ext != null && ext.getBackflowFlag() != null ? ext.getBackflowFlag() : 1);
            data.add(m);
        }
        res.put("code", 200);
        res.put("data", data);
        return res;
    }

    /** 错因标记：手动勾选保存（阶段2 Agent 自动识别后仍允许覆盖） */
    @PostMapping("/error-types")
    public Map<String, Object> setErrorTypes(@RequestBody Map<String, String> body) {
        Map<String, Object> res = new HashMap<>();
        Long userId = jwtAuth.getCurrentUserId();
        String questionId = body.get("questionId");
        String errorTypeIds = body.get("errorTypeIds");
        if (questionId == null || !questionId.startsWith(ENGLISH_PREFIX)) {
            res.put("code", 400);
            res.put("msg", "非法的题目标识");
            return res;
        }
        EnglishWrongExt ext = upsertExt(userId, questionId);
        ext.setErrorTypeIds(errorTypeIds == null || errorTypeIds.isBlank() ? null : errorTypeIds);
        extMapper.updateById(ext);
        res.put("code", 200);
        return res;
    }

    /** 重做结果：答对标记已攻克（回流=0），答错保持回流，等下一轮 PDCA 再来 */
    @PostMapping("/redo")
    public Map<String, Object> redo(@RequestBody Map<String, Object> body) {
        Map<String, Object> res = new HashMap<>();
        Long userId = jwtAuth.getCurrentUserId();
        String questionId = (String) body.get("questionId");
        boolean correct = Boolean.parseBoolean(String.valueOf(body.get("correct")));
        if (questionId == null || !questionId.startsWith(ENGLISH_PREFIX)) {
            res.put("code", 400);
            res.put("msg", "非法的题目标识");
            return res;
        }
        EnglishWrongExt ext = upsertExt(userId, questionId);
        ext.setRedoCount((ext.getRedoCount() == null ? 0 : ext.getRedoCount()) + 1);
        ext.setBackflowFlag(correct ? 0 : 1);
        ext.setLastRedoAt(LocalDateTime.now());
        extMapper.updateById(ext);
        res.put("code", 200);
        res.put("redoCount", ext.getRedoCount());
        res.put("backflowFlag", ext.getBackflowFlag());
        return res;
    }

    /** 按 (userId, questionId) 取扩展行，没有则建初始行（backflow_flag=1 待攻克） */
    private EnglishWrongExt upsertExt(Long userId, String questionId) {
        EnglishWrongExt ext = extMapper.selectOne(Wrappers.<EnglishWrongExt>lambdaQuery()
                .eq(EnglishWrongExt::getUserId, userId)
                .eq(EnglishWrongExt::getQuestionId, questionId));
        if (ext == null) {
            ext = new EnglishWrongExt();
            ext.setUserId(userId);
            ext.setQuestionId(questionId);
            ext.setRedoCount(0);
            ext.setBackflowFlag(1);
            extMapper.insert(ext);
        }
        return ext;
    }
}
