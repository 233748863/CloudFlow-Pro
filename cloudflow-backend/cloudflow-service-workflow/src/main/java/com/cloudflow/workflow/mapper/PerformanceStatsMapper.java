package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.monitor.PerformanceStats;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDate;
import java.util.List;

/**
 * 流程性能统计Mapper
 *
 * @author CloudFlow Team
 * @since 2026-02-21
 */
@Mapper
public interface PerformanceStatsMapper extends BaseMapper<PerformanceStats> {

    /**
     * 查询指定日期的统计数据
     *
     * @param tenantId 租户ID
     * @param statDate 统计日期
     * @return 统计数据列表
     */
    List<PerformanceStats> selectByDate(
            @Param("tenantId") Long tenantId,
            @Param("statDate") LocalDate statDate
    );

    /**
     * 查询指定日期范围的统计数据
     *
     * @param tenantId  租户ID
     * @param startDate 开始日期
     * @param endDate   结束日期
     * @return 统计数据列表
     */
    List<PerformanceStats> selectByDateRange(
            @Param("tenantId") Long tenantId,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate
    );

    /**
     * 查询指定流程定义的统计数据
     *
     * @param tenantId      租户ID
     * @param processDefKey 流程定义Key
     * @param startDate     开始日期
     * @param endDate       结束日期
     * @return 统计数据列表
     */
    List<PerformanceStats> selectByProcessDefKey(
            @Param("tenantId") Long tenantId,
            @Param("processDefKey") String processDefKey,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate
    );

    /**
     * 查询或创建统计记录
     *
     * @param tenantId      租户ID
     * @param statDate      统计日期
     * @param processDefKey 流程定义Key
     * @return 统计记录
     */
    PerformanceStats selectOrCreate(
            @Param("tenantId") Long tenantId,
            @Param("statDate") LocalDate statDate,
            @Param("processDefKey") String processDefKey
    );

    /**
     * 更新统计数据
     *
     * @param stats 统计数据
     * @return 更新数量
     */
    int updateStats(@Param("stats") PerformanceStats stats);
}
