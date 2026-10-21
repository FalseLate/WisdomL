package com.example.backend.entity;

import com.baomidou.mybatisplus.annotation.*;
import java.time.LocalDateTime;

/** 知识星图：用户手建的星系。颜色存 token 名；pin_* 同时非空 = 雾团中心被手摆过 */
@TableName("starmap_galaxy")
public class StarmapGalaxy {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private String title;
    @TableField(updateStrategy = FieldStrategy.IGNORED)
    private String color;
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
    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }
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
