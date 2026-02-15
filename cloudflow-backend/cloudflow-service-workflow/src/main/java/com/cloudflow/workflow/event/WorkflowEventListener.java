package com.cloudflow.workflow.event;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.workflow.domain.WfNodeRecord;
import com.cloudflow.workflow.mapper.WfNodeRecordMapper;
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
import java.util.Map;

/**
 * 工作流事件监听器
 * 借鉴 poco-flow FlowProcessEventListener 的设计思路，
 * 通过 Spring @EventListener 监听所有工作流事件，实现：
 *
 * 1. 节点执行记录（WfNodeRecord）：
 *    - NODE_STARTED  → 创建记录，状态 RUNNING，记录开始时间
 *    - NODE_COMPLETED → 更新记录，状态 COMPLETED，记录结束时间和耗时
 *
 * 2. 任务分配/完成记录：
 *    - TASK_ASSIGNED  → 创建节点记录（RUNNING），记录被分配人
 *    - TASK_COMPLETED → 更新节点记录（COMPLETED），计算审批耗时
 *
 * 3. 流程生命周期日志：
 *    - PROCESS_STARTED / COMPLETED / REJECTED / REVOKED → 记录关键日志
 *
 * 4. 变量变更追踪：
 *    - VARIABLE_UPDATED → Debug 级别日志，用于调试和审计
 *
 * 设计要点：
 * - 使用 @Async 异步处理，不阻塞主流程
 * - 所有处理逻辑 try-catch 包裹，异常不影响主流程
 * - 节点记录通过 instanceId + nodeKey 唯一定位
 */
@Component
public class WorkflowEventListener {

    private static final Logger log = LoggerFactory.getLogger(WorkflowEventListener.class);

    @Autowired
    private WfNodeRecordMapper nodeRecordMapper;

    /** 用于安全序列化 extraData，避免手动拼接 JSON 导致格式错误 */
    private final ObjectMapper objectMapper = new ObjectMapper();

    // ==================== 流程级事件处理 ====================

    /**
     * 处理流程启动事件
     * 记录流程启动日志，可扩展为创建流程级监控记录
     */
    @EventListener(condition = "#event.eventType == T(com.cloudflow.workflow.event.WorkflowEvent.EventType).PROCESS_STARTED")
    @Async("workflowEventExecutor")
    public void onProcessStarted(WorkflowEvent event) {
        try {
            log.info("[事件监听] 流程启动: instanceId={}, processDefKey={}, 发起人={}({})",
                    event.getInstanceId(), event.getProcessDefKey(),
                    event.getOperatorName(), event.getOperatorId());
        } catch (Exception e) {
            log.error("[事件监听] 处理流程启动事件失败: {}", e.getMessage(), e);
        }
    }

    /**
     * 处理流程完成事件
     * 将该实例下所有 RUNNING 状态的节点记录标记为 COMPLETED
     */
    @EventListener(condition = "#event.eventType == T(com.cloudflow.workflow.event.WorkflowEvent.EventType).PROCESS_COMPLETED")
    @Async("workflowEventExecutor")
    public void onProcessCompleted(WorkflowEvent event) {
        try {
            log.info("[事件监听] 流程完成: instanceId={}, processDefKey={}",
                    event.getInstanceId(), event.getProcessDefKey());

            // 将该实例下所有仍为 RUNNING 的节点记录标记为 COMPLETED
            nodeRecordMapper.update(null,
                    new LambdaUpdateWrapper<WfNodeRecord>()
                            .eq(WfNodeRecord::getInstanceId, event.getInstanceId())
                            .eq(WfNodeRecord::getStatus, "RUNNING")
                            .set(WfNodeRecord::getStatus, "COMPLETED")
                            .set(WfNodeRecord::getEndTime, LocalDateTime.now()));
        } catch (Exception e) {
            log.error("[事件监听] 处理流程完成事件失败: {}", e.getMessage(), e);
        }
    }

    /**
     * 处理流程拒绝事件
     */
    @EventListener(condition = "#event.eventType == T(com.cloudflow.workflow.event.WorkflowEvent.EventType).PROCESS_REJECTED")
    @Async("workflowEventExecutor")
    public void onProcessRejected(WorkflowEvent event) {
        try {
            log.info("[事件监听] 流程被拒绝: instanceId={}, 节点={}, 操作人={}({}), 意见={}",
                    event.getInstanceId(), event.getNodeName(),
                    event.getOperatorName(), event.getOperatorId(), event.getComment());

            // 将该实例下所有仍为 RUNNING 的节点记录标记为 COMPLETED
            nodeRecordMapper.update(null,
                    new LambdaUpdateWrapper<WfNodeRecord>()
                            .eq(WfNodeRecord::getInstanceId, event.getInstanceId())
                            .eq(WfNodeRecord::getStatus, "RUNNING")
                            .set(WfNodeRecord::getStatus, "COMPLETED")
                            .set(WfNodeRecord::getEndTime, LocalDateTime.now()));
        } catch (Exception e) {
            log.error("[事件监听] 处理流程拒绝事件失败: {}", e.getMessage(), e);
        }
    }

    /**
     * 处理流程撤回事件
     */
    @EventListener(condition = "#event.eventType == T(com.cloudflow.workflow.event.WorkflowEvent.EventType).PROCESS_REVOKED")
    @Async("workflowEventExecutor")
    public void onProcessRevoked(WorkflowEvent event) {
        try {
            log.info("[事件监听] 流程撤回: instanceId={}, 操作人={}({})",
                    event.getInstanceId(), event.getOperatorName(), event.getOperatorId());

            // 将该实例下所有仍为 RUNNING 的节点记录标记为 COMPLETED
            nodeRecordMapper.update(null,
                    new LambdaUpdateWrapper<WfNodeRecord>()
                            .eq(WfNodeRecord::getInstanceId, event.getInstanceId())
                            .eq(WfNodeRecord::getStatus, "RUNNING")
                            .set(WfNodeRecord::getStatus, "COMPLETED")
                            .set(WfNodeRecord::getEndTime, LocalDateTime.now()));
        } catch (Exception e) {
            log.error("[事件监听] 处理流程撤回事件失败: {}", e.getMessage(), e);
        }
    }

    // ==================== 节点级事件处理 ====================

    /**
     * 处理节点开始执行事件
     * 创建一条 WfNodeRecord，状态为 RUNNING，记录开始时间
     * 对应 poco-flow 的 ACTIVITY_STARTED 事件处理
     */
    @EventListener(condition = "#event.eventType == T(com.cloudflow.workflow.event.WorkflowEvent.EventType).NODE_STARTED")
    @Async("workflowEventExecutor")
    public void onNodeStarted(WorkflowEvent event) {
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
        } catch (Exception e) {
            log.error("[事件监听] 处理节点开始事件失败: nodeKey={}, error={}", event.getNodeKey(), e.getMessage(), e);
        }
    }

    /**
     * 处理节点执行完成事件
     * 查找该节点的 RUNNING 记录，更新为 COMPLETED，计算执行耗时
     * 对应 poco-flow 的 ACTIVITY_COMPLETED 事件处理
     */
    @EventListener(condition = "#event.eventType == T(com.cloudflow.workflow.event.WorkflowEvent.EventType).NODE_COMPLETED")
    @Async("workflowEventExecutor")
    public void onNodeCompleted(WorkflowEvent event) {
        try {
            log.info("[事件监听] 节点完成: instanceId={}, nodeKey={}, nodeName={}, nodeType={}",
                    event.getInstanceId(), event.getNodeKey(), event.getNodeName(), event.getNodeType());

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
                // 更新已有记录
                existingRecord.setStatus("COMPLETED");
                existingRecord.setEndTime(now);
                if (existingRecord.getStartTime() != null) {
                    existingRecord.setDurationMs(
                            Duration.between(existingRecord.getStartTime(), now).toMillis());
                }
                existingRecord.setExtraData(event.getExtraData());
                nodeRecordMapper.updateById(existingRecord);
            } else {
                // 没有找到 RUNNING 记录（可能是自动节点，开始和完成几乎同时发生）
                // 直接创建一条 COMPLETED 记录
                WfNodeRecord record = new WfNodeRecord();
                record.setInstanceId(event.getInstanceId());
                record.setProcessDefKey(event.getProcessDefKey());
                record.setNodeKey(event.getNodeKey());
                record.setNodeName(event.getNodeName());
                record.setNodeType(event.getNodeType());
                record.setStatus("COMPLETED");
                record.setStartTime(now);
                record.setEndTime(now);
                record.setDurationMs(0L);
                record.setExtraData(event.getExtraData());
                record.setCreateTime(now);
                nodeRecordMapper.insert(record);
            }
        } catch (Exception e) {
            log.error("[事件监听] 处理节点完成事件失败: nodeKey={}, error={}", event.getNodeKey(), e.getMessage(), e);
        }
    }

    // ==================== 任务级事件处理 ====================

    /**
     * 处理任务分配事件
     * 创建节点记录（RUNNING），记录被分配人信息
     * 对应 poco-flow 的 TASK_ASSIGNED 事件处理
     */
    @EventListener(condition = "#event.eventType == T(com.cloudflow.workflow.event.WorkflowEvent.EventType).TASK_ASSIGNED")
    @Async("workflowEventExecutor")
    public void onTaskAssigned(WorkflowEvent event) {
        try {
            log.info("[事件监听] 任务分配: instanceId={}, taskId={}, nodeKey={}, 分配给={}({})",
                    event.getInstanceId(), event.getTaskId(), event.getNodeKey(),
                    event.getOperatorName(), event.getOperatorId());

            // 检查是否已有该节点的 RUNNING 记录（避免重复创建，如会签场景）
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
                record.setNodeType(event.getNodeType());
                record.setStatus("RUNNING");
                record.setExecutorId(event.getOperatorId());
                record.setExecutorName(event.getOperatorName());
                record.setStartTime(event.getEventTime());
                record.setCreateTime(event.getEventTime());
                nodeRecordMapper.insert(record);
            }
        } catch (Exception e) {
            log.error("[事件监听] 处理任务分配事件失败: taskId={}, error={}", event.getTaskId(), e.getMessage(), e);
        }
    }

    /**
     * 处理任务完成事件
     * 更新节点记录为 COMPLETED，记录操作人、审批意见、耗时
     * 对应 poco-flow 的 TASK_COMPLETED 事件处理
     */
    @EventListener(condition = "#event.eventType == T(com.cloudflow.workflow.event.WorkflowEvent.EventType).TASK_COMPLETED")
    @Async("workflowEventExecutor")
    public void onTaskCompleted(WorkflowEvent event) {
        try {
            log.info("[事件监听] 任务完成: instanceId={}, taskId={}, nodeKey={}, action={}, 操作人={}({})",
                    event.getInstanceId(), event.getTaskId(), event.getNodeKey(),
                    event.getAction(), event.getOperatorName(), event.getOperatorId());

            LocalDateTime now = event.getEventTime();

            // 查找该节点的 RUNNING 记录
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
                // 将 action 和 comment 安全序列化后存入 extraData
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
        } catch (Exception e) {
            log.error("[事件监听] 处理任务完成事件失败: taskId={}, error={}", event.getTaskId(), e.getMessage(), e);
        }
    }

    /**
     * 安全构建任务完成的 extraData JSON
     * 使用 ObjectMapper 序列化，避免手动拼接导致的 JSON 注入或格式错误
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

    // ==================== 变量变更事件处理 ====================

    /**
     * 处理变量变更事件
     * 对应 poco-flow 的 VARIABLE_CREATED / VARIABLE_UPDATED / VARIABLE_DELETED 事件
     * 仅记录 Debug 级别日志，用于调试和审计追踪
     */
    @EventListener(condition = "#event.eventType == T(com.cloudflow.workflow.event.WorkflowEvent.EventType).VARIABLE_UPDATED")
    @Async("workflowEventExecutor")
    public void onVariableUpdated(WorkflowEvent event) {
        try {
            log.debug("[事件监听] 变量变更: instanceId={}, 操作人={}({}), 变更内容={}",
                    event.getInstanceId(), event.getOperatorName(), event.getOperatorId(),
                    event.getExtraData());
        } catch (Exception e) {
            log.error("[事件监听] 处理变量变更事件失败: {}", e.getMessage(), e);
        }
    }
}
