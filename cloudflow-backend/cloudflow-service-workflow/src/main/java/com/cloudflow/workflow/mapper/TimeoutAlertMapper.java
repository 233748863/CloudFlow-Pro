package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.monitor.TimeoutAlert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 超时告警 Mapper
 * 
 * @author CloudFlow Team
 * @since 2026-02-22
 */
@Mapper
public interface TimeoutAlertMapper extends BaseMapper<TimeoutAlert> {

    /**
     * 根据日期统计数量
     */
    Integer countByDate(@Param("startDate") LocalDateTime startDate);

    /**
     * 根据告警级别统计数量
     */
    Integer countByLevel(@Param("alertLevel") String alertLevel);

    /**
     * 查询超时告警列表
     */
    List<TimeoutAlert> selectTimeoutAlerts(@Param("alertType") String alertType,
                                          @Param("alertLevel") String alertLevel,
                                          @Param("resolved") Boolean resolved);

    /**
     * 查询未解决的告警
     */
    List<TimeoutAlert> selectUnresolved(@Param("tenantId") Long tenantId);

    /**
     * 按级别查询告警
     */
    List<TimeoutAlert> selectByLevel(@Param("tenantId") Long tenantId, 
                                     @Param("level") String level);

    /**
     * 按处理人查询告警
     */
    List<TimeoutAlert> selectByAssignee(@Param("tenantId") Long tenantId, 
                                        @Param("assigneeId") Long assigneeId);
}
