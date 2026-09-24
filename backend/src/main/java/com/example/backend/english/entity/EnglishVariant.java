package com.example.backend.english.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.time.LocalDateTime;

/**
 * AI 变式题：从错题提取考点后生成的同考点不同考法题目。
 * 攻克规则（阶段3升级）：原题重做答对 + 至少 1 道变式题答对，才退出回流池。
 */
@TableName("english_variant")
public class EnglishVariant {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private String sourceQuestionId;   // 来源错题 question_id
    private String questionContent;    // 题目 JSON：question/options/answer/explain/type
    private Integer correct;           // 0错 1对，NULL未答
    private LocalDateTime answeredAt;
    private LocalDateTime createdAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getSourceQuestionId() { return sourceQuestionId; }
    public void setSourceQuestionId(String sourceQuestionId) { this.sourceQuestionId = sourceQuestionId; }
    public String getQuestionContent() { return questionContent; }
    public void setQuestionContent(String questionContent) { this.questionContent = questionContent; }
    public Integer getCorrect() { return correct; }
    public void setCorrect(Integer correct) { this.correct = correct; }
    public LocalDateTime getAnsweredAt() { return answeredAt; }
    public void setAnsweredAt(LocalDateTime answeredAt) { this.answeredAt = answeredAt; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
