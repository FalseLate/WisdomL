package com.example.backend.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.example.backend.entity.UserPlan;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface UserPlanMapper extends BaseMapper<UserPlan> {
}
