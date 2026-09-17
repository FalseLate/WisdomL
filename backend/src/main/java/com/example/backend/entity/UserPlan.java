package com.example.backend.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("user_plan")
public class
UserPlan {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private String level;
    private Integer dailyCount;
    private LocalDate startDate;
    private String status;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
