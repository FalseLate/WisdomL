package com.example.backend.entity;

import com.baomidou.mybatisplus.annotation.*;
import java.time.LocalDateTime;

@TableName("answer_record")
public class AnswerRecord {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long recordId;
    private Integer questionIndex;
    private String userAnswer;
    private Integer isCorrect;
    private String questionContent;
    private String questionType;
    /** 作答用时（秒），慢题判定数据源，可空 */
    private Integer answerTime;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getRecordId() { return recordId; }
    public void setRecordId(Long recordId) { this.recordId = recordId; }
    public Integer getQuestionIndex() { return questionIndex; }
    public void setQuestionIndex(Integer questionIndex) { this.questionIndex = questionIndex; }
    public String getUserAnswer() { return userAnswer; }
    public void setUserAnswer(String userAnswer) { this.userAnswer = userAnswer; }
    public Integer getIsCorrect() { return isCorrect; }
    public void setIsCorrect(Integer isCorrect) { this.isCorrect = isCorrect; }
    public String getQuestionContent() { return questionContent; }
    public void setQuestionContent(String questionContent) { this.questionContent = questionContent; }
    public String getQuestionType() { return questionType; }
    public void setQuestionType(String questionType) { this.questionType = questionType; }
    public Integer getAnswerTime() { return answerTime; }
    public void setAnswerTime(Integer answerTime) { this.answerTime = answerTime; }
    public LocalDateTime getCreateTime() { return createTime; }
    public void setCreateTime(LocalDateTime createTime) { this.createTime = createTime; }
}
