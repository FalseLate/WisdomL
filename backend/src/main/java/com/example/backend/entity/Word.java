package com.example.backend.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("word")
public class Word {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String word;
    private String phonetic;
    private String cnMean;
    private String sentence;
    private String level;
    private LocalDateTime createTime;
}