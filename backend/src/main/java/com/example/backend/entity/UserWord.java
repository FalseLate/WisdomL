package com.example.backend.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("user_word")
public class UserWord {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private Long wordId;
    private Integer master;

    // ===== 间隔重复调度（简化艾宾浩斯：答对间隔×2上限30天，答错重置1天） =====
    private Integer reviewCount;
    private Integer intervalDays;
    private LocalDateTime nextReviewAt;   // NULL=新词，立即待复习
    private LocalDateTime lastReviewAt;
}
