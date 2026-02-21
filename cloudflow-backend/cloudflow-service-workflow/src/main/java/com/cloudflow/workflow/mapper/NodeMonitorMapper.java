package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.monitor.NodeMonitor;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 节点执行监控Mapper
 *
 * @author CloudFlow Team
 * @since 2026-02-21
 */
@Mapper
public interface NodeMonitorMapper extends BaseMapper<NodeMonitor> {

    /**
     * 查询流程实例的所有节点监控记录
     *
     * @param instanceId 流程实例ID
     * @return 节点监控列表
     */
    List<NodeMonitor> selectByInstanceId(@Param("instanceId") String instanceId);

    /**
     * 查询运行中的节点
     *
     * @param tenantId 租户ID
     * @return 运行中的节点列表
     */
    List<NodeMonitor> selectRunningNodes(@Param("tenantId") Long tenantId);

    /**
     * 查询失败的节点
     *
     * @param tenantId 租户ID
     * @param limit    限制数量
     * @return 失败的节点列表
     */
    List<NodeMonitor> selectFailedNodes(
            @Param("tenantId") Long tenantId,
            @Param("limit") Integer limit
    );

    /**
     * 统计节点执行情况
     *
     * @param tenantId 租户ID
     * @param nodeKey  节点Key
     * @return 统计结果
     */
    NodeMonitor selectNodeStatistics(
            @Param("tenantId") Long tenantId,
            @Param("nodeKey") String nodeKey
    );
}
