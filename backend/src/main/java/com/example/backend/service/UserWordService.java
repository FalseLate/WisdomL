package com.example.backend.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.example.backend.entity.UserWord;
import com.example.backend.entity.Word;
import com.example.backend.mapper.UserWordMapper;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class UserWordService extends ServiceImpl<UserWordMapper, UserWord> {

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
}