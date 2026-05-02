package com.cloudflow.workflow.event;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfNodeRecord;
import com.cloudflow.workflow.domain.monitor.NodeMonitor;
import com.cloudflow.workflow.mapper.NodeMonitorMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfNodeRecordMapper;
import com.cloudflow.workflow.service.monitor.IProcessMonitorService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 工作流核心事件监听器
 *
 * 消费新版类型安全事件，实现节点执行记录（WfNodeRecord）的自动维护。
 * 通过 @EventListener 直接按事件类型监听，无需 SpEL condition。
 *
 * 职责：
 *   1. 节点记录管理：NodeStartedEvent → 创建 RUNNING 记录，NodeCompletedEvent → 更新为 COMPLETED
 *   2. 任务记录管理：TaskAssignedEvent → 创建节点记录，TaskCompletedEvent → 更新并记录审批详情
 *   3. 流程生命周期：流程完成/拒绝/撤回/作废时，批量关闭所有 RUNNING 节点记录
 *
 * 设计要点：
 *   - @Async 异步处理，不阻塞主流程
 *   - 所有方法 try-catch 包裹，异常不影响主流程
 *   - 节点记录通过 instanceId + nodeKey 唯一定位
 */
@Component
public class WorkflowEventListener {

    private static final Logger log = LoggerFactory.getLogger(WorkflowEventListener.class);

    @Autowired
    private WfNodeRecordMapper nodeRecordMapper;

    @Autowired
    private NodeMonitorMapper nodeMonitorMapper;

    @Autowired
    private WfProcessInstanceMapper processInstanceMapper;

    @Autowired
    private IProcessMonitorService processMonitorService;

    /** 用于安全序列化 extraData */
    private final ObjectMapper objectMapper = new ObjectMapper();

    // ==================== 流程级事件 ====================

    /**
     * 流程启动 — 记录日志
     */
    @EventListener
    @Async("workflowEventExecutor")
    public void onProcessStarted(ProcessStartedEvent event) {
        try {
            log.info("[事件监听] 流程启动: instanceId={}, processDefKey={}, 发起人={}({}), businessKey={}",
                    event.getInstanceId(), event.getProcessDefKey(),
                    event.getOperatorName(), event.getOperatorId(), event.getBusinessKey());
        } catch (Exception e) {
            log.error("[事件监听] 处理流程启动事件失败: {}", e.getMessage(), e);
        }
    }

    /**
     * 流程完成 — 关闭所有 RUNNING 节点记录
     */
    @EventListener
    @Async("workflowEventExecutor")
    public void onProcessCompleted(ProcessCompletedEvent event) {
        try {
            log.info("[事件监听] 流程完成: instanceId={}, processDefKey={}",
                    event.getInstanceId(), event.getProcessDefKey());
            closeRunningNodeRecords(event.getInstanceId());
        } catch (Exception e) {
            log.error("[事件监听] 处理流程完成事件失败: {}", e.getMessage(), e);
        }
    }

    /**
     * 流程拒绝 — 关闭所有 RUNNING 节点记录
     */
    @EventListener
    @Async("workflowEventExecutor")
    public void onProcessRejected(ProcessRejectedEvent event) {
        try {
            log.info("[事件监听] 流程被拒绝: instanceId={}, 节点={}, 操作人={}({}), 意见={}",
                    event.getInstanceId(), event.getNodeName(),
                    event.getOperatorName(), event.getOperatorId(), event.getComment());
            closeRunningNodeRecords(event.getInstanceId());
        } catch (Exception e) {
            log.error("[事件监听] 处理流程拒绝事件失败: {}", e.getMessage(), e);
        }
    }

    /**
     * 流程撤回 — 关闭所有 RUNNING 节点记录
     */
    @EventListener
    @Async("workflowEventExecutor")
    public void onProcessRevoked(ProcessRevokedEvent event) {
        try {
            log.info("[事件监听] 流程撤回: instanceId={}, 操作人={}({})",
                    event.getInstanceId(), event.getOperatorName(), event.getOperatorId());
            closeRunningNodeRecords(event.getInstanceId());
        } catch (Exception e) {
            log.error("[事件监听] 处理流程撤回事件失败: {}", e.getMessage(), e);
        }
    }

    /**
     * 流程作废 — 关闭所有 RUNNING 节点记录
     */
    @EventListener
    @Async("workflowEventExecutor")
    public void onProcessInvalidated(ProcessInvalidatedEvent event) {
        try {
            log.info("[事件监听] 流程作废: instanceId={}, 原因={}, 删除任务数={}",
                    event.getInstanceId(), event.getReason(), event.getDeletedTasks());
            closeRunningNodeRecords(event.getInstanceId());
        } catch (Exception e) {
            log.error("[事件监听] 处理流程作废事件失败: {}", e.getMessage(), e);
        }
    }

    // ==================== 节点级事件 ====================

    /**
     * 节点开始 — 创建 RUNNING 状态的节点记录
     */
    @EventListener
    @Async("workflowEventExecutor")
    public void onNodeStarted(NodeStartedEvent event) {
        try {
            log.info("[事件监听] 节点开始: instanceId={}, nodeKey={}, nodeName={}, nodeType={}",
                    event.getInstanceId(), event.getNodeKey(), event.getNodeName(), event.getNodeType());

            WfNodeRecord record = new WfNodeRecord();
            record.setInstanceId(event.getInstanceId());
            record.setProcessDefKey(event.getProcessDefKey());
            record.setNodeKey(event.getNodeKey());
            record.setNodeName(event.getNodeName());
            record.setNodeType(event.getNodeType());
            record.setStatus("RUNNING");
            record.setStartTime(event.getEventTime());
            record.setCreateTime(event.getEventTime());
            nodeRecordMapper.insert(record);
            createNodeMonitor(event.getInstanceId(), event.getNodeKey(), event.getNodeName(),
                    event.getNodeType(), event.getEventTime());
        } catch (Exception e) {
            log.error("[事件监听] 处理节点开始事件失败: nodeKey={}, error={}", event.getNodeKey(), e.getMessage(), e);
        }
    }

    /**
     * 节点完成 — 更新节点记录为 COMPLETED，计算执行耗时
     */
    @EventListener
    @Async("workflowEventExecutor")
    public void onNodeCompleted(NodeCompletedEvent event) {
        try {
            log.info("[事件监听] 节点完成: instanceId={}, nodeKey={}, nodeName={}, durationMs={}",
                    event.getInstanceId(), event.getNodeKey(), event.getNodeName(), event.getDurationMs());

            LocalDateTime now = event.getEventTime();

            // 查找该节点最近一条 RUNNING 状态的记录
            WfNodeRecord existingRecord = nodeRecordMapper.selectOne(
                    new LambdaQueryWrapper<WfNodeRecord>()
                            .eq(WfNodeRecord::getInstanceId, event.getInstanceId())
                            .eq(WfNodeRecord::getNodeKey, event.getNodeKey())
                            .eq(WfNodeRecord::getStatus, "RUNNING")
                            .orderByDesc(WfNodeRecord::getStartTime)
                            .last("LIMIT 1"));

            if (existingRecord != null) {
                existingRecord.setStatus("COMPLETED");
                existingRecord.setEndTime(now);
                // 优先使用事件携带的耗时，否则自行计算
                if (event.getDurationMs() > 0) {
                    existingRecord.setDurationMs(event.getDurationMs());
                } else if (existingRecord.getStartTime() != null) {
                    existingRecord.setDurationMs(
                            Duration.between(existingRecord.getStartTime(), now).toMillis());
                }
                nodeRecordMapper.updateById(existingRecord);
            } else {
                // 自动节点（开始和完成几乎同时），直接创建 COMPLETED 记录
                WfNodeRecord record = new WfNodeRecord();
                record.setInstanceId(event.getInstanceId());
                record.setProcessDefKey(event.getProcessDefKey());
                record.setNodeKey(event.getNodeKey());
                record.setNodeName(event.getNodeName());
                record.setNodeType(event.getNodeType());
                record.setStatus("COMPLETED");
                record.setStartTime(now);
                record.setEndTime(now);
                record.setDurationMs(event.getDurationMs());
                record.setCreateTime(now);
                nodeRecordMapper.insert(record);
            }
            completeNodeMonitor(event.getInstanceId(), event.getNodeKey(), event.getNodeName(),
                    event.getNodeType(), now, event.getDurationMs());
        } catch (Exception e) {
            log.error("[事件监听] 处理节点完成事件失败: nodeKey={}, error={}", event.getNodeKey(), e.getMessage(), e);
        }
    }

    // ==================== 任务级事件 ====================

    /**
     * 任务分配 — 创建节点记录（RUNNING），记录被分配人
     */
    @EventListener
    @Async("workflowEventExecutor")
    public void onTaskAssigned(TaskAssignedEvent event) {
        try {
            log.info("[事件监听] 任务分配: instanceId={}, taskId={}, nodeKey={}, 分配给={}({})",
                    event.getInstanceId(), event.getTaskId(), event.getNodeKey(),
                    event.getAssigneeName(), event.getAssigneeId());

            // 避免重复创建（会签场景同一节点可能分配多个任务）
            Long existCount = nodeRecordMapper.selectCount(
                    new LambdaQueryWrapper<WfNodeRecord>()
                            .eq(WfNodeRecord::getInstanceId, event.getInstanceId())
                            .eq(WfNodeRecord::getNodeKey, event.getNodeKey())
                            .eq(WfNodeRecord::getStatus, "RUNNING"));

            if (existCount == null || existCount == 0) {
                WfNodeRecord record = new WfNodeRecord();
                record.setInstanceId(event.getInstanceId());
                record.setProcessDefKey(event.getProcessDefKey());
                record.setNodeKey(event.getNodeKey());
                record.setNodeName(event.getNodeName());
                record.setNodeType("APPROVAL");
                record.setStatus("RUNNING");
                record.setExecutorId(event.getAssigneeId());
                record.setExecutorName(event.getAssigneeName());
                record.setStartTime(event.getEventTime());
                record.setCreateTime(event.getEventTime());
                nodeRecordMapper.insert(record);
                createNodeMonitor(event.getInstanceId(), event.getNodeKey(), event.getNodeName(),
                        "APPROVAL", event.getEventTime());
            }
        } catch (Exception e) {
            log.error("[事件监听] 处理任务分配事件失败: taskId={}, error={}", event.getTaskId(), e.getMessage(), e);
        }
    }

    /**
     * 任务完成 — 更新节点记录为 COMPLETED，记录操作人和审批意见
     */
    @EventListener
    @Async("workflowEventExecutor")
    public void onTaskCompleted(TaskCompletedEvent event) {
        try {
            log.info("[事件监听] 任务完成: instanceId={}, taskId={}, nodeKey={}, action={}, 操作人={}({})",
                    event.getInstanceId(), event.getTaskId(), event.getNodeKey(),
                    event.getAction(), event.getOperatorName(), event.getOperatorId());

            LocalDateTime now = event.getEventTime();

            WfNodeRecord existingRecord = nodeRecordMapper.selectOne(
                    new LambdaQueryWrapper<WfNodeRecord>()
                            .eq(WfNodeRecord::getInstanceId, event.getInstanceId())
                            .eq(WfNodeRecord::getNodeKey, event.getNodeKey())
                            .eq(WfNodeRecord::getStatus, "RUNNING")
                            .orderByDesc(WfNodeRecord::getStartTime)
                            .last("LIMIT 1"));

            if (existingRecord != null) {
                existingRecord.setStatus("COMPLETED");
                existingRecord.setExecutorId(event.getOperatorId());
                existingRecord.setExecutorName(event.getOperatorName());
                existingRecord.setEndTime(now);
                if (existingRecord.getStartTime() != null) {
                    existingRecord.setDurationMs(
                            Duration.between(existingRecord.getStartTime(), now).toMillis());
                }
                existingRecord.setExtraData(buildTaskExtraData(event.getAction(), event.getComment()));
                nodeRecordMapper.updateById(existingRecord);
            } else {
                // 没有 RUNNING 记录，直接创建 COMPLETED 记录
                WfNodeRecord record = new WfNodeRecord();
                record.setInstanceId(event.getInstanceId());
                record.setProcessDefKey(event.getProcessDefKey());
                record.setNodeKey(event.getNodeKey());
                record.setNodeName(event.getNodeName());
                record.setNodeType("APPROVAL");
                record.setStatus("COMPLETED");
                record.setExecutorId(event.getOperatorId());
                record.setExecutorName(event.getOperatorName());
                record.setStartTime(now);
                record.setEndTime(now);
                record.setDurationMs(0L);
                record.setExtraData(buildTaskExtraData(event.getAction(), event.getComment()));
                record.setCreateTime(now);
                nodeRecordMapper.insert(record);
            }
            completeNodeMonitor(event.getInstanceId(), event.getNodeKey(), event.getNodeName(),
                    "APPROVAL", now, 0L);
        } catch (Exception e) {
            log.error("[事件监听] 处理任务完成事件失败: taskId={}, error={}", event.getTaskId(), e.getMessage(), e);
        }
    }

    // ==================== 内部方法 ====================

    /**
     * 关闭指定流程实例下所有 RUNNING 状态的节点记录
     */
    private void closeRunningNodeRecords(String instanceId) {
        nodeRecordMapper.update(null,
                new LambdaUpdateWrapper<WfNodeRecord>()
                        .eq(WfNodeRecord::getInstanceId, instanceId)
                        .eq(WfNodeRecord::getStatus, "RUNNING")
                        .set(WfNodeRecord::getStatus, "COMPLETED")
                        .set(WfNodeRecord::getEndTime, LocalDateTime.now()));
        closeRunningNodeMonitors(instanceId);
    }

    private void createNodeMonitor(String instanceId, String nodeKey, String nodeName,
                                   String nodeType, LocalDateTime eventTime) {
        try {
            NodeMonitor monitor = new NodeMonitor();
            WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
            monitor.setTenantId(instance != null ? instance.getTenantId() : null);
            monitor.setInstanceId(instanceId);
            monitor.setNodeId(nodeKey);
            monitor.setNodeKey(nodeKey);
            monitor.setNodeName(nodeName);
            monitor.setNodeType(nodeType);
            monitor.setStartTime(eventTime);
            monitor.setStatus("RUNNING");
            monitor.setRetryCount(0);
            monitor.setCreateTime(eventTime);
            monitor.setUpdateTime(eventTime);
            nodeMonitorMapper.insert(monitor);
            processMonitorService.incrementNodeCount(instanceId);
        } catch (Exception e) {
            log.warn("[事件监听] 记录节点监控失败: instanceId={}, nodeKey={}, error={}",
                    instanceId, nodeKey, e.getMessage());
        }
    }

    private void completeNodeMonitor(String instanceId, String nodeKey, String nodeName,
                                     String nodeType, LocalDateTime completeTime, long durationMs) {
        try {
            NodeMonitor monitor = nodeMonitorMapper.selectOne(
                    new LambdaQueryWrapper<NodeMonitor>()
                            .eq(NodeMonitor::getInstanceId, instanceId)
                            .eq(NodeMonitor::getNodeKey, nodeKey)
                            .eq(NodeMonitor::getStatus, "RUNNING")
                            .orderByDesc(NodeMonitor::getStartTime)
                            .last("LIMIT 1"));

            if (monitor == null) {
                createCompletedNodeMonitor(instanceId, nodeKey, nodeName, nodeType, completeTime, durationMs);
                return;
            }

            monitor.setStatus("COMPLETED");
            monitor.setEndTime(completeTime);
            if (durationMs > 0) {
                monitor.setDuration(durationMs);
            } else if (monitor.getStartTime() != null) {
                monitor.setDuration(Duration.between(monitor.getStartTime(), completeTime).toMillis());
            }
            monitor.setUpdateTime(LocalDateTime.now());
            nodeMonitorMapper.updateById(monitor);
        } catch (Exception e) {
            log.warn("[事件监听] 更新节点监控失败: instanceId={}, nodeKey={}, error={}",
                    instanceId, nodeKey, e.getMessage());
        }
    }

    private void createCompletedNodeMonitor(String instanceId, String nodeKey, String nodeName,
                                            String nodeType, LocalDateTime completeTime, long durationMs) {
        NodeMonitor monitor = new NodeMonitor();
        WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
        monitor.setTenantId(instance != null ? instance.getTenantId() : null);
        monitor.setInstanceId(instanceId);
        monitor.setNodeId(nodeKey);
        monitor.setNodeKey(nodeKey);
        monitor.setNodeName(nodeName);
        monitor.setNodeType(nodeType);
        monitor.setStartTime(completeTime);
        monitor.setEndTime(completeTime);
        monitor.setDuration(Math.max(durationMs, 0L));
        monitor.setStatus("COMPLETED");
        monitor.setRetryCount(0);
        monitor.setCreateTime(completeTime);
        monitor.setUpdateTime(completeTime);
        nodeMonitorMapper.insert(monitor);
        processMonitorService.incrementNodeCount(instanceId);
    }

    private void closeRunningNodeMonitors(String instanceId) {
        try {
            LocalDateTime now = LocalDateTime.now();
            List<NodeMonitor> runningMonitors = nodeMonitorMapper.selectList(
                    new LambdaQueryWrapper<NodeMonitor>()
                            .eq(NodeMonitor::getInstanceId, instanceId)
                            .eq(NodeMonitor::getStatus, "RUNNING"));
            for (NodeMonitor monitor : runningMonitors) {
                monitor.setStatus("COMPLETED");
                monitor.setEndTime(now);
                if (monitor.getStartTime() != null) {
                    monitor.setDuration(Duration.between(monitor.getStartTime(), now).toMillis());
                }
                monitor.setUpdateTime(now);
                nodeMonitorMapper.updateById(monitor);
            }
        } catch (Exception e) {
            log.warn("[事件监听] 关闭节点监控失败: instanceId={}, error={}", instanceId, e.getMessage());
        }
    }

    /**
     * 安全构建任务完成的 extraData JSON
     */
    private String buildTaskExtraData(String action, String comment) {
        try {
            Map<String, String> data = new HashMap<>();
            data.put("action", action != null ? action : "");
            data.put("comment", comment != null ? comment : "");
            return objectMapper.writeValueAsString(data);
        } catch (Exception e) {
            log.warn("[事件监听] 序列化 extraData 失败: {}", e.getMessage());
            return "{}";
        }
    }
}
