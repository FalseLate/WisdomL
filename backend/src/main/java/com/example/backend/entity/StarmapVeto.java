package com.example.backend.entity;

import com.baomidou.mybatisplus.annotation.*;
import java.time.LocalDateTime;

/**
 * 知识星图：用户否决记录。删掉的共现线在重算时不能再冒出来。
 * 同时记 id 对与规范化名对：只记 id 时"删掉知识点再建同名"会让线复活，只记名字时两个改名节点会误伤。
 * 字段命名避开 aPoint 这类首字母小写+第二字母大写的写法，否则 MyBatis-Plus / Jackson 的属性名推导会出错。
 */
@TableName("starmap_veto")
public class StarmapVeto {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    /** cooc / ai / hier */
    private String kind;
    /** 端点按 id 升序排列后取 A/B */
    private Long pointA;
    private Long pointB;
    private String keyA;
    private String keyB;
    /** 名称快照：端点已删时列表还能看懂 */
    private String titleA;
    private String titleB;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public Long getPointA() { return pointA; }
    public void setPointA(Long pointA) { this.pointA = pointA; }
    public Long getPointB() { return pointB; }
    public void setPointB(Long pointB) { this.pointB = pointB; }
    public String getKeyA() { return keyA; }
    public void setKeyA(String keyA) { this.keyA = keyA; }
    public String getKeyB() { return keyB; }
    public void setKeyB(String keyB) { this.keyB = keyB; }
    public String getTitleA() { return titleA; }
    public void setTitleA(String titleA) { this.titleA = titleA; }
    public String getTitleB() { return titleB; }
    public void setTitleB(String titleB) { this.titleB = titleB; }
    public LocalDateTime getCreateTime() { return createTime; }
    public void setCreateTime(LocalDateTime createTime) { this.createTime = createTime; }
}
