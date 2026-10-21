package com.example.backend.entity;

import com.baomidou.mybatisplus.annotation.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/** 知识星图：语义线。层级线与共现线不落表（由归属与错题关联派生），只有"主张"需要存 */
@TableName("starmap_edge")
public class StarmapEdge {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    /** 起点（先修端）。端点可以是知识点也可以是大球，所以配 *_kind 一起看 */
    private Long fromPoint;
    private Long toPoint;
    private String fromKind;
    private String toKind;
    /** ai = AI 提的候选，custom = 用户自己连的 */
    private String kind;
    private String rel;
    /** 为什么连：AI 必须给理由，用户可选填 */
    private String reason;
    private BigDecimal conf;
    /** candidate 待确认（不画进图）/ accepted 已确认 */
    private String status;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public Long getFromPoint() { return fromPoint; }
    public void setFromPoint(Long fromPoint) { this.fromPoint = fromPoint; }
    public Long getToPoint() { return toPoint; }
    public void setToPoint(Long toPoint) { this.toPoint = toPoint; }
    public String getFromKind() { return fromKind; }
    public void setFromKind(String fromKind) { this.fromKind = fromKind; }
    public String getToKind() { return toKind; }
    public void setToKind(String toKind) { this.toKind = toKind; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public String getRel() { return rel; }
    public void setRel(String rel) { this.rel = rel; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public BigDecimal getConf() { return conf; }
    public void setConf(BigDecimal conf) { this.conf = conf; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public LocalDateTime getCreateTime() { return createTime; }
    public void setCreateTime(LocalDateTime createTime) { this.createTime = createTime; }
    public LocalDateTime getUpdateTime() { return updateTime; }
    public void setUpdateTime(LocalDateTime updateTime) { this.updateTime = updateTime; }
}
