package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.HrPerformanceObjective;
import com.fasterxml.jackson.databind.JsonNode;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;

public interface HrPerformanceObjectiveMapper extends BaseMapper<HrPerformanceObjective> {

    @Update("""
            UPDATE hr_performance_objective
            SET metric_config = #{metricConfig,typeHandler=com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler},
                update_time = #{updateTime}
            WHERE tenant_id = #{tenantId}
              AND id = #{id}
              AND deleted = 0
            """)
    int updateMetricConfig(@Param("tenantId") Long tenantId,
                           @Param("id") Long id,
                           @Param("metricConfig") JsonNode metricConfig,
                           @Param("updateTime") LocalDateTime updateTime);
}
