package com.example.backend.entity;

import com.baomidou.mybatisplus.annotation.*;
import java.time.LocalDateTime;

/** 知识星图：主题（大球）。pin_* 三列同时非空 = 用户手摆过的位置，同时为空 = 回自动排布 */
@TableName("starmap_topic")
public class StarmapTopic {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private String title;
    /** 用户自己写的星球说明/笔记；空串也要能覆盖旧值 */
    @TableField(updateStrategy = FieldStrategy.IGNORED)
    private String note;
    /** 分组色：存主题 token 名（如 --accent），不存色值 */
    @TableField(updateStrategy = FieldStrategy.IGNORED)
    private String color;
    /** 手建星系的 id；NULL = 走标题派生的自动成团 */
    @TableField(updateStrategy = FieldStrategy.IGNORED)
    private Long galaxyId;
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
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }
    public Long getGalaxyId() { return galaxyId; }
    public void setGalaxyId(Long galaxyId) { this.galaxyId = galaxyId; }
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
