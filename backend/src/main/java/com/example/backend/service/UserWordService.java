package com.example.backend.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.example.backend.english.entity.EnglishStudyLog;
import com.example.backend.english.mapper.EnglishStudyLogMapper;
import com.example.backend.entity.UserWord;
import com.example.backend.entity.Word;
import com.example.backend.mapper.UserWordMapper;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class UserWordService extends ServiceImpl<UserWordMapper, UserWord> {

    @Resource
    private EnglishStudyLogMapper studyLogMapper;

    // 添加生词本（去重）
    public void addCollect(Long userId, Long wordId) {
        LambdaQueryWrapper<UserWord> wrapper = Wrappers.lambdaQuery();
        wrapper.eq(UserWord::getUserId, userId).eq(UserWord::getWordId, wordId);
        long cnt = this.count(wrapper);
        if (cnt > 0) {
            return;
        }
        UserWord uw = new UserWord();
        uw.setUserId(userId);
        uw.setWordId(wordId);
        uw.setMaster(0);
        uw.setCreateTime(LocalDateTime.now());
        this.save(uw);
    }

    /**
     * 取消收藏生词
     */
    public void removeCollect(Long userId, Long wordId) {
        LambdaQueryWrapper<UserWord> wrapper = Wrappers.lambdaQuery();
        wrapper.eq(UserWord::getUserId, userId)
                .eq(UserWord::getWordId, wordId);
        this.remove(wrapper);
    }

    /**
     * 获取用户所有收藏单词详情（关联Word表）
     */
    public List<Word> getUserCollectWords(Long userId) {
        return baseMapper.selectCollectWordByUserId(userId);
    }

    // ===== 间隔重复复习 =====

    /** 今日待复习：next_review_at 为空（新词）或已到期 */
    public List<UserWord> getDueWords(Long userId) {
        LambdaQueryWrapper<UserWord> wrapper = Wrappers.lambdaQuery();
        wrapper.eq(UserWord::getUserId, userId)
                .and(q -> q.isNull(UserWord::getNextReviewAt)
                        .or().le(UserWord::getNextReviewAt, LocalDateTime.now()));
        return this.list(wrapper);
    }

    /** 复习结果回写：答对间隔×2（上限30天），答错重置为1天 */
    public void recordReviewResult(Long userId, Long wordId, boolean correct) {
        LambdaQueryWrapper<UserWord> wrapper = Wrappers.lambdaQuery();
        wrapper.eq(UserWord::getUserId, userId).eq(UserWord::getWordId, wordId);
        UserWord uw = this.getOne(wrapper);
        if (uw == null) return;
        LocalDateTime now = LocalDateTime.now();
        int cur = uw.getIntervalDays() == null ? 1 : uw.getIntervalDays();
        int interval;
        if (correct) {
            interval = Math.min(Math.max(cur * 2, 2), 30);
            uw.setReviewCount((uw.getReviewCount() == null ? 0 : uw.getReviewCount()) + 1);
        } else {
            interval = 1;
        }
        uw.setIntervalDays(interval);
        uw.setLastReviewAt(now);
        uw.setNextReviewAt(now.plusDays(interval));
        this.updateById(uw);

        // 学习事件日志：周报统计源（失败不影响复习主流程）
        try {
            EnglishStudyLog lg = new EnglishStudyLog();
            lg.setUserId(userId);
            lg.setLogType(1);
            lg.setRefId(wordId);
            lg.setCorrect(correct ? 1 : 0);
            lg.setCreatedAt(now);
            studyLogMapper.insert(lg);
        } catch (Exception ignored) { }
    }
}