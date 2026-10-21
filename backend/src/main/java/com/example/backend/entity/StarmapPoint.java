package com.example.backend.entity;

import com.baomidou.mybatisplus.annotation.*;
import java.time.LocalDateTime;

/**
 * 知识星图：知识点（小球）。
 * topicId 决定"在不在球里"，hierLine 决定"那条归属线画不画" —— 用户明确要求这两件事分开。
 */
@TableName("starmap_point")
public class StarmapPoint {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    @TableField(updateStrategy = FieldStrategy.IGNORED)
    private Long topicId;
    /** 1=画与所属主题的层级线，0=不画（线被用户删了，但它仍在这颗球里） */
    private Integer hierLine;
    private String title;
    /** 规范化名：去空白标点、统一小写。查重与否决的稳定键 */
    private String titleKey;
    /** 用户自己写的知识点描述/笔记；空串也要能覆盖旧值，所以 updateStrategy=IGNORED */
    @TableField(updateStrategy = FieldStrategy.IGNORED)
    private String note;
    @TableField(updateStrategy = FieldStrategy.IGNORED)
    private String color;
    private Integer merged;
    /** 手动 / AI反推 */
    private String origin;
    /** 用户手摆的位置：相对所属大球球心的偏移（游离星为绝对坐标）；三列同时为空 = 自动排布 */
    @TableField(updateStrategy = FieldStrategy.IGNORED)
    private Float pinX;
    @TableField(updateStrategy = FieldStrategy.IGNORED)
    private Float pinY;
    @TableField(updateStrategy = FieldStrategy.IGNORED)
    private Float pinZ;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public Long getTopicId() { return topicId; }
    public void setTopicId(Long topicId) { this.topicId = topicId; }
    public Integer getHierLine() { return hierLine; }
    public void setHierLine(Integer hierLine) { this.hierLine = hierLine; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getTitleKey() { return titleKey; }
    public void setTitleKey(String titleKey) { this.titleKey = titleKey; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }
    public Integer getMerged() { return merged; }
    public void setMerged(Integer merged) { this.merged = merged; }
    public String getOrigin() { return origin; }
    public void setOrigin(String origin) { this.origin = origin; }
    public Float getPinX() { return pinX; }
    public void setPinX(Float pinX) { this.pinX = pinX; }
    public Float getPinY() { return pinY; }
    public void setPinY(Float pinY) { this.pinY = pinY; }
    public Float getPinZ() { return pinZ; }
    public void setPinZ(Float pinZ) { this.pinZ = pinZ; }
    public LocalDateTime getCreateTime() { return createTime; }
    public void setCreateTime(LocalDateTime createTime) { this.createTime = createTime; }
    public LocalDateTime getUpdateTime() { return updateTime; }
    public void setUpdateTime(LocalDateTime updateTime) { this.updateTime = updateTime; }
}
