package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.HrSeveranceRuleSlab;
import org.apache.ibatis.annotations.Param;

public interface HrSeveranceRuleSlabMapper extends BaseMapper<HrSeveranceRuleSlab> {
    Long lock(@Param("tenantId") Long tenantId, @Param("identifier") Long identifier);
}
