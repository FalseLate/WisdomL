package com.example.backend.english.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.time.LocalDateTime;

/**
 * 英语学习事件日志：周报统计的数据源。
 * 只追加不修改：复习生词、错题重做等关键事件各记一行，按 (user_id, created_at) 聚合。
 */
@TableName("english_study_log")
public class EnglishStudyLog {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private Integer logType;      // 1复习生词 2错题重做
    private Long refId;           // word_id 或错题主键
    private Integer correct;      // 1答对 0答错
    private LocalDateTime createdAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public Integer getLogType() { return logType; }
    public void setLogType(Integer logType) { this.logType = logType; }
    public Long getRefId() { return refId; }
    public void setRefId(Long refId) { this.refId = refId; }
    public Integer getCorrect() { return correct; }
    public void setCorrect(Integer correct) { this.correct = correct; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
