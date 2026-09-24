package com.example.backend.english.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.time.LocalDateTime;

/**
 * 英语错题 PDCA 扩展表：错因标签 / 重做 / 回流。
 * 错题正文存放在 user_wrong_question（只读引用，不修改其结构与数据），
 * 本表仅沉淀英语功能自己的学情数据，按 (user_id, question_id) 一题一行。
 */
@TableName("english_wrong_ext")
public class EnglishWrongExt {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private String questionId;
    private String errorTypeIds;   // 错因标签，逗号分隔 1-5（1审题 2知识 3策略 4逻辑 5习惯）
    private Integer redoCount;     // 重做次数
    private Integer backflowFlag;  // 1回流下一轮PDCA 0已攻克
    private LocalDateTime lastRedoAt;
    private Long absorbedWikiId;   // 该错题已沉淀的私人 Wiki 条目 id（同题去重用）
    private Integer lastRedoCorrect;  // 最近一次原题重做对错（1对0错，攻克判定用）

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getQuestionId() { return questionId; }
    public void setQuestionId(String questionId) { this.questionId = questionId; }
    public String getErrorTypeIds() { return errorTypeIds; }
    public void setErrorTypeIds(String errorTypeIds) { this.errorTypeIds = errorTypeIds; }
    public Integer getRedoCount() { return redoCount; }
    public void setRedoCount(Integer redoCount) { this.redoCount = redoCount; }
    public Integer getBackflowFlag() { return backflowFlag; }
    public void setBackflowFlag(Integer backflowFlag) { this.backflowFlag = backflowFlag; }
    public LocalDateTime getLastRedoAt() { return lastRedoAt; }
    public void setLastRedoAt(LocalDateTime lastRedoAt) { this.lastRedoAt = lastRedoAt; }
    public Long getAbsorbedWikiId() { return absorbedWikiId; }
    public void setAbsorbedWikiId(Long absorbedWikiId) { this.absorbedWikiId = absorbedWikiId; }
    public Integer getLastRedoCorrect() { return lastRedoCorrect; }
    public void setLastRedoCorrect(Integer lastRedoCorrect) { this.lastRedoCorrect = lastRedoCorrect; }
}
