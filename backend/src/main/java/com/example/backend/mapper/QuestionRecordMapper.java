package com.example.backend.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.example.backend.entity.QuestionRecord;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface QuestionRecordMapper extends BaseMapper<QuestionRecord> {
}
