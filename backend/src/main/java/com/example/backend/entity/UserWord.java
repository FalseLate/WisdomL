package com.example.backend.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("user_word")
public class UserWord {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private Long wordId;
    private Integer master;
}
