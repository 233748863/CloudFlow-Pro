package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.monitor.AnomalyAlert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 异常告警Mapper
 *
 * @author CloudFlow Team
 * @since 2026-02-21
 */
@Mapper
public interface AnomalyAlertMapper extends BaseMapper<AnomalyAlert> {

    /**
     * 查询未解决的异常告警
     *
     * @param tenantId 租户ID
     * @return 告警列表
     */
    List<AnomalyAlert> selectUnresolved(@Param("tenantId") Long tenantId);

    /**
     * 查询指定类型的异常告警
     *
     * @param tenantId    租户ID
     * @param anomalyType 异常类型
     * @return 告警列表
     */
    List<AnomalyAlert> selectByType(
            @Param("tenantId") Long tenantId,
            @Param("anomalyType") String anomalyType
    );

    /**
     * 查询指定严重程度的异常告警
     *
     * @param tenantId 租户ID
     * @param severity 严重程度
     * @return 告警列表
     */
    List<AnomalyAlert> selectBySeverity(
            @Param("tenantId") Long tenantId,
            @Param("severity") String severity
    );

    /**
     * 查询指定流程的异常告警
     *
     * @param tenantId      租户ID
     * @param processDefKey 流程定义Key
     * @return 告警列表
     */
    List<AnomalyAlert> selectByProcessDefKey(
            @Param("tenantId") Long tenantId,
            @Param("processDefKey") String processDefKey
    );

    /**
     * 统计异常类型分布
     *
     * @param tenantId  租户ID
     * @param startTime 开始时间
     * @param endTime   结束时间
     * @return 统计结果
     */
    List<AnomalyAlert> selectTypeStatistics(
            @Param("tenantId") Long tenantId,
            @Param("startTime") LocalDateTime startTime,
            @Param("endTime") LocalDateTime endTime
    );
}
