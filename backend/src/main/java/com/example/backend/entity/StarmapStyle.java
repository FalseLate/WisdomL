package com.example.backend.entity;

import com.baomidou.mybatisplus.annotation.*;
import java.time.LocalDateTime;

/**
 * 知识星图：外观与隐藏覆盖层。
 * 用 JSON 列存，避免"每加一个可调项就要 ALTER 一次表"。
 */
@TableName("starmap_style")
public class StarmapStyle {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    /** edge / point / topic */
    private String targetType;
    /** 稳定键：cooc|<minId>|<maxId>、hier|<topicId>|<pointId>、ai|<edgeId>、custom|<edgeId> */
    private String targetKey;
    private String styleJson;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getTargetType() { return targetType; }
    public void setTargetType(String targetType) { this.targetType = targetType; }
    public String getTargetKey() { return targetKey; }
    public void setTargetKey(String targetKey) { this.targetKey = targetKey; }
    public String getStyleJson() { return styleJson; }
    public void setStyleJson(String styleJson) { this.styleJson = styleJson; }
    public LocalDateTime getCreateTime() { return createTime; }
    public void setCreateTime(LocalDateTime createTime) { this.createTime = createTime; }
    public LocalDateTime getUpdateTime() { return updateTime; }
    public void setUpdateTime(LocalDateTime updateTime) { this.updateTime = updateTime; }
}
