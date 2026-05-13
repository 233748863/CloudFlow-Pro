package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.monitor.AnomalyAlert;
import com.cloudflow.workflow.domain.monitor.PerformanceAnomalyTypeBreakdownItem;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 异常告警 Mapper
 * 
 * @author CloudFlow Team
 * @since 2026-02-22
 */
@Mapper
public interface AnomalyAlertMapper extends BaseMapper<AnomalyAlert> {

    /**
     * 根据日期统计数量
     */
    Integer countByDate(@Param("startDate") LocalDateTime startDate,
                        @Param("tenantId") Long tenantId);

    /**
     * 统计未解决的异常数量
     */
    Integer countUnresolved(@Param("tenantId") Long tenantId);

    /**
     * 查询异常告警列表
     */
    List<AnomalyAlert> selectAnomalyAlerts(@Param("anomalyType") String anomalyType,
                                          @Param("severity") String severity,
                                          @Param("resolved") Boolean resolved,
                                          @Param("tenantId") Long tenantId);

    /**
     * 查询未解决的告警
     */
    List<AnomalyAlert> selectUnresolved(@Param("tenantId") Long tenantId);

    /**
     * 按类型查询告警
     */
    List<AnomalyAlert> selectByType(@Param("tenantId") Long tenantId, 
                                    @Param("type") String type);

    /**
     * 按严重程度查询告警
     */
    List<AnomalyAlert> selectBySeverity(@Param("tenantId") Long tenantId, 
                                        @Param("severity") String severity);

    /**
     * 按流程定义Key查询告警
     */
    List<AnomalyAlert> selectByProcessDefKey(@Param("tenantId") Long tenantId, 
                                             @Param("processDefKey") String processDefKey);

    /**
     * 查询异常类型统计
     */
    List<AnomalyAlert> selectTypeStatistics(@Param("tenantId") Long tenantId,
                                           @Param("startDate") LocalDateTime startDate,
                                           @Param("endDate") LocalDateTime endDate);

    /**
     * 查询异常类型分布。
     */
    List<PerformanceAnomalyTypeBreakdownItem> selectAnomalyTypeBreakdown(
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate,
            @Param("processDefKey") String processDefKey,
            @Param("tenantId") Long tenantId
    );
}
