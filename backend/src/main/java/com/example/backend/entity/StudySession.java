package com.example.backend.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("study_session")
public class StudySession {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private String level;
    private String mode;
    private LocalDate studyDate;
    /** 本次要刷的单词id列表，JSON 数组字符串 */
    private String wordIds;
    private Integer total;
    private Integer done;
    private Integer correct;
    private String status;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
