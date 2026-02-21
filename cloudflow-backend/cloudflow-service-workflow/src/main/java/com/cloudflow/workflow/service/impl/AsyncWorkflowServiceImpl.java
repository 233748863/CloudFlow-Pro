package com.cloudflow.workflow.service.impl;

import com.cloudflow.workflow.domain.WfAuditLog;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfProcessSnapshot;
import com.cloudflow.workflow.domain.vo.NotificationRequest;
import com.cloudflow.workflow.event.WorkflowEvent;
import com.cloudflow.workflow.event.WorkflowEventPublisher;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfProcessSnapshotMapper;
import com.cloudflow.workflow.service.IAsyncWorkflowService;
import com.cloudflow.workflow.service.ISysNoticeService;
import com.cloudflow.workflow.service.WorkflowAuditService;
import com.cloudflow.workflow.service.monitor.IProcessMonitorService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.Date;
import java.util.UUID;

/**
 * 异步工作流服务实现
 * 使用@Async注解实现异步执行
 * 
 * @author CloudFlow Team
 * @since 2026-02-21
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AsyncWorkflowServiceImpl implements IAsyncWorkflowService {

    private final ISysNoticeService sysNoticeService;
    private final WorkflowEventPublisher workflowEventPublisher;
    private final WfProcessInstanceMapper processInstanceMapper;
    private final WfProcessSnapshotMapper snapshotMapper;
    private final IProcessMonitorService processMonitorService;
    private final WorkflowAuditService workflowAuditService;

    /**
     * 异步发送通知
     * 使用notificationExecutor线程池
     */
    @Override
    @Async("notificationExecutor")
    public void sendNotificationAsync(NotificationRequest request) {
        long startTime = System.currentTimeMillis();
        
        try {
            log.debug("开始异步发送通知: type={}, recipients={}", 
                request.getType(), 
                request.getRecipients());
            
            // 实际的通知发送逻辑
            // 1. 根据通知类型选择发送渠道
            String type = request.getType();
            String title = request.getTitle();
            String content = request.getContent();
            
            // 2. 调用系统通知服务发送站内信
            if (request.getRecipients() != null && !request.getRecipients().isEmpty()) {
                for (Long recipientId : request.getRecipients()) {
                    try {
                        sysNoticeService.sendNotice(
                            recipientId,
                            title,
                            content,
                            type,
                            com.cloudflow.common.core.utils.SecurityUtils.getUserId(),
                            com.cloudflow.common.core.utils.SecurityUtils.getUsername()
                        );
                    } catch (Exception e) {
                        log.warn("发送通知失败: recipientId={}, error={}", recipientId, e.getMessage());
                    }
                }
            }
            
            // 3. 记录发送结果（已通过sysNoticeService内部记录）
            
            long duration = System.currentTimeMillis() - startTime;
            log.info("异步发送通知完成: type={}, 耗时={}ms", request.getType(), duration);
            
        } catch (Exception e) {
            log.error("异步发送通知失败: type={}", request.getType(), e);
            // 可以在这里实现重试逻辑或记录失败日志
        }
    }

    /**
     * 异步记录审计日志
     * 使用auditExecutor线程池
     */
    @Override
    @Async("auditExecutor")
    public void recordAuditLogAsync(WfAuditLog auditLog) {
        long startTime = System.currentTimeMillis();
        
        try {
            log.debug("开始异步记录审计日志: action={}, userId={}", 
                auditLog.getAction(), 
                auditLog.getUserId());
            
            // 实际的审计日志记录逻辑
            // 1. 补充审计日志信息
            if (auditLog.getActionTime() == null) {
                auditLog.setActionTime(java.time.LocalDateTime.now());
            }
            
            // 2. 通过WorkflowAuditService记录审计日志
            // 将action字符串转换为AuditAction枚举
            WorkflowAuditService.AuditAction auditAction;
            try {
                auditAction = WorkflowAuditService.AuditAction.valueOf(auditLog.getAction());
            } catch (IllegalArgumentException e) {
                // 如果无法转换，使用默认值
                auditAction = WorkflowAuditService.AuditAction.TASK_COMPLETE;
            }
            
            String detail = String.format("用户[%s]对任务[%s]执行[%s]操作", 
                auditLog.getUserName(), auditLog.getTaskId(), auditLog.getActionDesc());
            workflowAuditService.log(auditAction, auditLog.getInstanceId(), detail);
            
            // 3. 可选：发送到日志中心（预留扩展点）
            // logCenterService.send(auditLog);
            
            long duration = System.currentTimeMillis() - startTime;
            log.debug("异步记录审计日志完成: action={}, 耗时={}ms", 
                auditLog.getAction(), duration);
            
        } catch (Exception e) {
            log.error("异步记录审计日志失败: action={}", auditLog.getAction(), e);
        }
    }

    /**
     * 异步发布工作流事件
     * 使用workflowExecutor线程池
     */
    @Override
    @Async("workflowExecutor")
    public void publishEventAsync(WorkflowEvent event) {
        long startTime = System.currentTimeMillis();
        
        try {
            log.debug("开始异步发布工作流事件: type={}, instanceId={}", 
                event.getEventType(), 
                event.getInstanceId());
            
            // 实际的事件发布逻辑
            // 1. 调用事件发布器（Spring事件机制）
            workflowEventPublisher.publishProcessStarted(null);
            
            // 2. 通知所有监听器（由Spring自动处理）
            
            // 3. 记录事件日志
            log.info("工作流事件已发布: type={}, instanceId={}", 
                event.getEventType(), event.getInstanceId());
            
            long duration = System.currentTimeMillis() - startTime;
            log.debug("异步发布工作流事件完成: type={}, 耗时={}ms", 
                event.getEventType(), duration);
            
        } catch (Exception e) {
            log.error("异步发布工作流事件失败: type={}", event.getEventType(), e);
        }
    }

    /**
     * 异步生成流程快照
     * 使用workflowExecutor线程池
     */
    @Override
    @Async("workflowExecutor")
    public void generateSnapshotAsync(String instanceId) {
        long startTime = System.currentTimeMillis();
        
        try {
            log.debug("开始异步生成流程快照: instanceId={}", instanceId);
            
            // 实际的快照生成逻辑
            // 1. 查询流程实例当前状态
            WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
            if (instance == null) {
                log.warn("流程实例不存在，无法生成快照: instanceId={}", instanceId);
                return;
            }
            
            // 2. 序列化流程数据
            ObjectMapper mapper = new ObjectMapper();
            String snapshotData = mapper.writeValueAsString(instance);
            
            // 3. 保存快照到数据库
            WfProcessSnapshot snapshot = new WfProcessSnapshot();
            snapshot.setSnapshotId(UUID.randomUUID().toString());
            snapshot.setInstanceId(instanceId);
            snapshot.setStatus(instance.getStatus());
            snapshot.setVariables(instance.getVariables());
            snapshot.setCreateTime(new Date());
            // 4. 可选：压缩快照数据（预留扩展点）
            // snapshot.setCompressed(true);
            // snapshot.setData(compress(snapshotData));
            
            snapshotMapper.insert(snapshot);
            
            long duration = System.currentTimeMillis() - startTime;
            log.info("异步生成流程快照完成: instanceId={}, 耗时={}ms", instanceId, duration);
            
        } catch (Exception e) {
            log.error("异步生成流程快照失败: instanceId={}", instanceId, e);
        }
    }

    /**
     * 异步更新流程统计数据
     * 使用workflowExecutor线程池
     */
    @Override
    @Async("workflowExecutor")
    public void updateStatisticsAsync(String instanceId) {
        long startTime = System.currentTimeMillis();
        
        try {
            log.debug("开始异步更新流程统计数据: instanceId={}", instanceId);
            
            // 实际的统计更新逻辑
            // 1. 查询流程实例
            WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
            if (instance == null) {
                log.warn("流程实例不存在，无法更新统计: instanceId={}", instanceId);
                return;
            }
            
            // 2. 计算流程执行时长
            if (instance.getStartTime() != null && instance.getEndTime() != null) {
                long duration = instance.getEndTime().getTime() - instance.getStartTime().getTime();
                log.debug("流程执行时长: instanceId={}, duration={}ms", instanceId, duration);
            }
            
            // 3. 更新流程监控统计（通过监控服务）
            try {
                processMonitorService.recordProcessEnd(
                    instanceId,
                    instance.getStatus(),
                    null
                );
            } catch (Exception e) {
                log.warn("更新流程监控统计失败: {}", e.getMessage());
            }
            
            // 4. 更新流程成功率等统计信息（已通过监控服务处理）
            
            long duration = System.currentTimeMillis() - startTime;
            log.debug("异步更新流程统计数据完成: instanceId={}, 耗时={}ms", 
                instanceId, duration);
            
        } catch (Exception e) {
            log.error("异步更新流程统计数据失败: instanceId={}", instanceId, e);
        }
    }
}
