package com.example.backend.entity;

import com.baomidou.mybatisplus.annotation.*;
import java.time.LocalDateTime;

/** 知识星图：错题 ↔ 知识点。共现线与掌握度都从这张表现算，不存成品 */
@TableName("starmap_point_ref")
public class StarmapPointRef {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private Long wrongQuestionId;
    private Long pointId;
    /** AI确认 / 手动挂上 */
    private String source;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public Long getWrongQuestionId() { return wrongQuestionId; }
    public void setWrongQuestionId(Long wrongQuestionId) { this.wrongQuestionId = wrongQuestionId; }
    public Long getPointId() { return pointId; }
    public void setPointId(Long pointId) { this.pointId = pointId; }
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    public LocalDateTime getCreateTime() { return createTime; }
    public void setCreateTime(LocalDateTime createTime) { this.createTime = createTime; }
}
