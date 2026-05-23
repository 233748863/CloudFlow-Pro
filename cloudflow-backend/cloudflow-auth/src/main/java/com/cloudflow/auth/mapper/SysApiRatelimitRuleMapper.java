package com.cloudflow.auth.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.auth.domain.SysApiRatelimitRule;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface SysApiRatelimitRuleMapper extends BaseMapper<SysApiRatelimitRule> {
}
