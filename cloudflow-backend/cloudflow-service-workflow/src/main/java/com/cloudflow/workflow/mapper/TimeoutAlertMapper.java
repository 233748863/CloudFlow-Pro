package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.monitor.TimeoutAlert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 超时告警Mapper
 *
 * @author CloudFlow Team
 * @since 2026-02-21
 */
@Mapper
public interface TimeoutAlertMapper extends BaseMapper<TimeoutAlert> {

    /**
     * 查询未解决的超时告警
     *
     * @param tenantId 租户ID
     * @return 告警列表
     */
    List<TimeoutAlert> selectUnresolved(@Param("tenantId") Long tenantId);

    /**
     * 查询指定处理人的超时告警
     *
     * @param tenantId   租户ID
     * @param assigneeId 处理人ID
     * @return 告警列表
     */
    List<TimeoutAlert> selectByAssignee(
            @Param("tenantId") Long tenantId,
            @Param("assigneeId") Long assigneeId
    );

    /**
     * 查询指定级别的超时告警
     *
     * @param tenantId     租户ID
     * @param timeoutLevel 超时级别
     * @return 告警列表
     */
    List<TimeoutAlert> selectByLevel(
            @Param("tenantId") Long tenantId,
            @Param("timeoutLevel") String timeoutLevel
    );

    /**
     * 批量更新通知发送状态
     *
     * @param ids 告警ID列表
     * @return 更新数量
     */
    int batchUpdateNotificationSent(@Param("ids") List<Long> ids);
}
