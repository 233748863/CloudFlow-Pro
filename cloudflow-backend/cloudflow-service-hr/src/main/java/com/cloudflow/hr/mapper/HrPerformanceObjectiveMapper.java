package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.HrPerformanceObjective;
import com.fasterxml.jackson.databind.JsonNode;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;

public interface HrPerformanceObjectiveMapper extends BaseMapper<HrPerformanceObjective> {

    int updateMetricConfig(@Param("tenantId") Long tenantId,
                           @Param("id") Long id,
                           @Param("metricConfig") JsonNode metricConfig,
                           @Param("updateTime") LocalDateTime updateTime);
}
