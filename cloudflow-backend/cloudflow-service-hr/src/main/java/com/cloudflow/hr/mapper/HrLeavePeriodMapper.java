package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.HrLeavePeriod;

public interface HrLeavePeriodMapper extends BaseMapper<HrLeavePeriod> {
    HrLeavePeriod selectLocked(@org.apache.ibatis.annotations.Param("periodId") Long periodId,
                               @org.apache.ibatis.annotations.Param("tenantId") Long tenantId);
}
