package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.monitor.PerformanceStats;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDate;
import java.util.List;

/**
 * 性能统计 Mapper
 * 
 * @author CloudFlow Team
 * @since 2026-02-22
 */
@Mapper
public interface PerformanceStatsMapper extends BaseMapper<PerformanceStats> {

    /**
     * 查询性能统计数据
     */
    List<PerformanceStats> selectPerformanceStats(@Param("startDate") LocalDate startDate,
                                                  @Param("endDate") LocalDate endDate,
                                                  @Param("processDefKey") String processDefKey);
}
