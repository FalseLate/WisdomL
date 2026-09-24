package com.example.backend.reading.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 分级阅读文章：content 为整篇结构化 JSON（段落/句子/译文/长难句拆解/读后题），由离线脚本预生成入库
 */
@Data
@TableName("reading_article")
public class ReadingArticle {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String title;

    /** 难度档：4 简单(四级) / 6 中等(六级) / ky 高阶(考研) */
    private String level;

    /** 题材：story 小故事 / science 科普 / essay 议论文 */
    private String genre;

    /** 结构化 JSON 正文 */
    private String content;

    private LocalDateTime createTime;
}
