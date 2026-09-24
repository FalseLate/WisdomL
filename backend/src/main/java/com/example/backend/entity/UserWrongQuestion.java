package com.example.backend.entity;

import com.baomidou.mybatisplus.annotation.*;
import java.time.LocalDateTime;

@TableName("user_wrong_question")
public class UserWrongQuestion {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private String questionId;
    private String questionContent;
    private String questionType;
    private String userAnswer;
    private String correctAnswer;
    private String explanation;
    private Integer score;
    private Integer wrongCount;
    private Integer isRemoved;

    // ===== PDCA 错题闭环第一阶段新增字段 =====
    /** 错因编码逗号分隔：audit审题 / knowledge知识 / math数学 / strategy策略 / habit习惯 */
    // IGNORED：updateById 时 null 也会显式 SET NULL，保证"清空错因"能落库（所有更新均为查全量后整对象写回）
    @TableField(updateStrategy = FieldStrategy.IGNORED)
    private String errorTypes;
    /** 错因反思文字（自我小结） */
    @TableField(updateStrategy = FieldStrategy.IGNORED)
    private String errorNote;
    /** 是否慢题：0否 1是 */
    private Integer isSlow;
    /** 本次作答用时（秒） */
    private Integer answerTime;
    /** 订正状态：0未订正 1看过解析未重做 2重做答对(复习中) 3已掌握 */
    private Integer status;
    /** 累计重做/复习次数 */
    private Integer reviewCount;
    /** 连续重做答对次数，答错清零，达到3则 status=3 */
    private Integer correctStreak;
    /** 最近一次重做时间 */
    private LocalDateTime lastReviewTime;
    /** 简化 SM-2 下次复习时间（间隔 1/3/7 天）；掌握时置 null 并必须落库，故用 IGNORED 忽略非空策略 */
    @TableField(updateStrategy = FieldStrategy.IGNORED)
    private LocalDateTime nextReviewTime;
    /** 知识点标签，一期留空 */
    private String knowledgePoints;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getQuestionId() { return questionId; }
    public void setQuestionId(String questionId) { this.questionId = questionId; }
    public String getQuestionContent() { return questionContent; }
    public void setQuestionContent(String questionContent) { this.questionContent = questionContent; }
    public String getQuestionType() { return questionType; }
    public void setQuestionType(String questionType) { this.questionType = questionType; }
    public String getUserAnswer() { return userAnswer; }
    public void setUserAnswer(String userAnswer) { this.userAnswer = userAnswer; }
    public String getCorrectAnswer() { return correctAnswer; }
    public void setCorrectAnswer(String correctAnswer) { this.correctAnswer = correctAnswer; }
    public String getExplanation() { return explanation; }
    public void setExplanation(String explanation) { this.explanation = explanation; }
    public Integer getScore() { return score; }
    public void setScore(Integer score) { this.score = score; }
    public Integer getWrongCount() { return wrongCount; }
    public void setWrongCount(Integer wrongCount) { this.wrongCount = wrongCount; }
    public Integer getIsRemoved() { return isRemoved; }
    public void setIsRemoved(Integer isRemoved) { this.isRemoved = isRemoved; }
    public String getErrorTypes() { return errorTypes; }
    public void setErrorTypes(String errorTypes) { this.errorTypes = errorTypes; }
    public String getErrorNote() { return errorNote; }
    public void setErrorNote(String errorNote) { this.errorNote = errorNote; }
    public Integer getIsSlow() { return isSlow; }
    public void setIsSlow(Integer isSlow) { this.isSlow = isSlow; }
    public Integer getAnswerTime() { return answerTime; }
    public void setAnswerTime(Integer answerTime) { this.answerTime = answerTime; }
    public Integer getStatus() { return status; }
    public void setStatus(Integer status) { this.status = status; }
    public Integer getReviewCount() { return reviewCount; }
    public void setReviewCount(Integer reviewCount) { this.reviewCount = reviewCount; }
    public Integer getCorrectStreak() { return correctStreak; }
    public void setCorrectStreak(Integer correctStreak) { this.correctStreak = correctStreak; }
    public LocalDateTime getLastReviewTime() { return lastReviewTime; }
    public void setLastReviewTime(LocalDateTime lastReviewTime) { this.lastReviewTime = lastReviewTime; }
    public LocalDateTime getNextReviewTime() { return nextReviewTime; }
    public void setNextReviewTime(LocalDateTime nextReviewTime) { this.nextReviewTime = nextReviewTime; }
    public String getKnowledgePoints() { return knowledgePoints; }
    public void setKnowledgePoints(String knowledgePoints) { this.knowledgePoints = knowledgePoints; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
