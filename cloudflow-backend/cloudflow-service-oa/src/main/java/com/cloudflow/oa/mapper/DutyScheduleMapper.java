package com.cloudflow.oa.mapper;

import com.baomidou.dynamic.datasource.annotation.DS;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.common.datasource.constants.DsConstants;
import com.cloudflow.oa.domain.DutySchedule;
import org.apache.ibatis.annotations.Mapper;

/**
 * 值班排班 Mapper 接口
 */
@DS(DsConstants.MASTER)
@Mapper
public interface DutyScheduleMapper extends BaseMapper<DutySchedule> {
}
