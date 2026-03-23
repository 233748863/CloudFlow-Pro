package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.ScheduleRule;
import org.apache.ibatis.annotations.Mapper;

/**
 * 排班规则Mapper接口
 */
@Mapper
public interface ScheduleRuleMapper extends BaseMapper<ScheduleRule> {
}
