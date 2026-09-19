package com.example.backend.reading.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.example.backend.reading.entity.ReadingArticle;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ReadingArticleMapper extends BaseMapper<ReadingArticle> {
}
