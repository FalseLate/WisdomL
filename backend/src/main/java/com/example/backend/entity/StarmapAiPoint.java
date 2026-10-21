package com.example.backend.entity;

import com.baomidou.mybatisplus.annotation.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 知识星图：AI 从错题反推出的知识点候选 + "这题分析过了吗"。
 * 有任意一行就代表这道错题已经烧过 token 了，所以不需要给 user_wrong_question 加状态列。
 */
@TableName("starmap_ai_point")
public class StarmapAiPoint {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private Long wrongQuestionId;
    /** AI 反推出的知识点名（failed 时为空串占位） */
    private String title;
    private String titleKey;
    /** AI 反推出的知识讲解（约100字）；确认后写入 starmap_point.note */
    private String reason;
    /** 模型自评：该知识点与这道错题的关联把握 0~1（未校准） */
    private BigDecimal conf;
    /** pending 待确认 / accepted 已落地 / rejected 用户忽略 / failed 分析失败 */
    private String status;
    /** 落地后的知识点 id（同名并入时指向已有点） */
    @TableField(updateStrategy = FieldStrategy.IGNORED)
    private Long acceptedPointId;
    @TableField(updateStrategy = FieldStrategy.IGNORED)
    private String error;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public Long getWrongQuestionId() { return wrongQuestionId; }
    public void setWrongQuestionId(Long wrongQuestionId) { this.wrongQuestionId = wrongQuestionId; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getTitleKey() { return titleKey; }
    public void setTitleKey(String titleKey) { this.titleKey = titleKey; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public BigDecimal getConf() { return conf; }
    public void setConf(BigDecimal conf) { this.conf = conf; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Long getAcceptedPointId() { return acceptedPointId; }
    public void setAcceptedPointId(Long acceptedPointId) { this.acceptedPointId = acceptedPointId; }
    public String getError() { return error; }
    public void setError(String error) { this.error = error; }
    public LocalDateTime getCreateTime() { return createTime; }
    public void setCreateTime(LocalDateTime createTime) { this.createTime = createTime; }
    public LocalDateTime getUpdateTime() { return updateTime; }
    public void setUpdateTime(LocalDateTime updateTime) { this.updateTime = updateTime; }
}
