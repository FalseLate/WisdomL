package com.example.backend.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.example.backend.entity.UserWord;
import com.example.backend.entity.Word;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface UserWordMapper extends BaseMapper<UserWord> {

    @Select("SELECT w.* FROM user_word uw " +
            "LEFT JOIN word w ON uw.word_id = w.id " +
            "WHERE uw.user_id = #{userId}")
    List<Word> selectCollectWordByUserId(@Param("userId") Long userId);
}