package com.example.backend.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.example.backend.entity.Word;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface WordMapper extends BaseMapper<Word> {
}