package com.cloudflow.workflow.event;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

/**
 * OA 模块工作流事件监听器（示例）
 *
 * 演示外部业务模块如何通过新版类型安全事件与工作流引擎解耦。
 * 无需了解 WorkflowEvent 内部枚举，直接按事件类型监听即可。
 *
 * 使用方式：
 *   - @EventListener 直接监听具体事件类（如 ProcessStartedEvent）
 *   - 也可监听基类（如 ProcessEvent）捕获所有流程级事件
 *   - 通过 processDefKey 过滤特定流程类型
 *
 * 扩展指南：
 *   业务模块可参考此类创建自己的监听器，实现：
 *   - 请假流程启动后自动创建考勤记录
 *   - 报销流程完成后触发财务系统对接
 *   - 合同审批通过后生成电子签章任务
 *   - 流程拒绝后发送企业微信/钉钉通知
 */
@Component
public class OaWorkflowEventListener {

    private static final Logger log = LoggerFactory.getLogger(OaWorkflowEventListener.class);

    // ==================== 流程启动 ====================

    /**
     * 监听请假流程启动 — 自动创建考勤记录
     */
    @EventListener
    @Async("workflowEventExecutor")
    public void onLeaveProcessStarted(ProcessStartedEvent event) {
        if (!"wf_leave".equals(event.getProcessDefKey())
                && !"biz_leave".equals(event.getProcessDefKey())) {
            return;
        }
        try {
            log.info("[OA监听] 请假流程启动: instanceId={}, 发起人={}({}), businessKey={}",
                    event.getInstanceId(), event.getOperatorName(),
                    event.getOperatorId(), event.getBusinessKey());
            // 扩展点：调用考勤服务创建请假记录
            // 示例：attendanceService.createLeaveRecord(event.getOperatorId(), event.getBusinessKey());
        } catch (Exception e) {
            log.error("[OA监听] 处理请假流程启动失败: {}", e.getMessage(), e);
        }
    }

    /**
     * 监听报销流程启动 — 初始化报销单状态
     */
    @EventListener
    @Async("workflowEventExecutor")
    public void onReimburseProcessStarted(ProcessStartedEvent event) {
        if (!"wf_reimburse".equals(event.getProcessDefKey())
                && !"biz_reimburse".equals(event.getProcessDefKey())) {
            return;
        }
        try {
            log.info("[OA监听] 报销流程启动: instanceId={}, 发起人={}({})",
                    event.getInstanceId(), event.getOperatorName(), event.getOperatorId());
            // 扩展点：调用财务服务初始化报销单
            // 示例：financeService.initReimburseOrder(event.getBusinessKey(), event.getOperatorId());
        } catch (Exception e) {
            log.error("[OA监听] 处理报销流程启动失败: {}", e.getMessage(), e);
        }
    }

    // ==================== 流程完成 ====================

    /**
     * 监听请假流程完成 — 更新考勤系统
     */
    @EventListener
    @Async("workflowEventExecutor")
    public void onLeaveProcessCompleted(ProcessCompletedEvent event) {
        if (!"wf_leave".equals(event.getProcessDefKey())
                && !"biz_leave".equals(event.getProcessDefKey())) {
            return;
        }
        try {
            log.info("[OA监听] 请假流程审批通过: instanceId={}", event.getInstanceId());
            // 扩展点：更新考勤系统，扣减年假余额
            // 示例：attendanceService.approveLeave(event.getInstanceId());
        } catch (Exception e) {
            log.error("[OA监听] 处理请假流程完成失败: {}", e.getMessage(), e);
        }
    }

    /**
     * 监听报销流程完成 — 触发财务打款
     */
    @EventListener
    @Async("workflowEventExecutor")
    public void onReimburseProcessCompleted(ProcessCompletedEvent event) {
        if (!"wf_reimburse".equals(event.getProcessDefKey())
                && !"biz_reimburse".equals(event.getProcessDefKey())) {
            return;
        }
        try {
            log.info("[OA监听] 报销流程审批通过: instanceId={}", event.getInstanceId());
            // 扩展点：触发财务系统打款
            // 示例：financeService.triggerPayment(event.getInstanceId());
        } catch (Exception e) {
            log.error("[OA监听] 处理报销流程完成失败: {}", e.getMessage(), e);
        }
    }

    // ==================== 流程拒绝 ====================

    /**
     * 监听所有流程拒绝 — 发送通知给发起人
     */
    @EventListener
    @Async("workflowEventExecutor")
    public void onProcessRejected(ProcessRejectedEvent event) {
        try {
            log.info("[OA监听] 流程被拒绝: instanceId={}, processDefKey={}, 节点={}, 意见={}",
                    event.getInstanceId(), event.getProcessDefKey(),
                    event.getNodeName(), event.getComment());
            // 扩展点：发送企业微信/钉钉通知给发起人
            // 示例：notificationService.sendRejectionNotice(event.getInstanceId(), event.getComment());
        } catch (Exception e) {
            log.error("[OA监听] 处理流程拒绝通知失败: {}", e.getMessage(), e);
        }
    }

    // ==================== 流程作废 ====================

    /**
     * 监听流程作废 — 清理业务数据
     */
    @EventListener
    @Async("workflowEventExecutor")
    public void onProcessInvalidated(ProcessInvalidatedEvent event) {
        try {
            log.info("[OA监听] 流程被作废: instanceId={}, processDefKey={}, 原因={}, 删除任务数={}",
                    event.getInstanceId(), event.getProcessDefKey(),
                    event.getReason(), event.getDeletedTasks());
            // 扩展点：根据流程类型清理对应的业务数据
            // 示例：businessCleanupService.cleanup(event.getProcessDefKey(), event.getInstanceId());
        } catch (Exception e) {
            log.error("[OA监听] 处理流程作废清理失败: {}", e.getMessage(), e);
        }
    }

    // ==================== 任务级事件 ====================

    /**
     * 监听任务分配 — 发送待办提醒（所有流程通用）
     */
    @EventListener
    @Async("workflowEventExecutor")
    public void onTaskAssigned(TaskAssignedEvent event) {
        try {
            log.debug("[OA监听] 任务分配: instanceId={}, taskId={}, 分配给={}({})",
                    event.getInstanceId(), event.getTaskId(),
                    event.getAssigneeName(), event.getAssigneeId());
            // 扩展点：发送待办提醒（站内信、邮件、APP推送等）
            // 示例：pushService.sendTodoReminder(event.getAssigneeId(), event.getNodeName());
        } catch (Exception e) {
            log.error("[OA监听] 处理任务分配提醒失败: {}", e.getMessage(), e);
        }
    }

    /**
     * 监听任务完成 — 记录审批轨迹（所有流程通用）
     */
    @EventListener
    @Async("workflowEventExecutor")
    public void onTaskCompleted(TaskCompletedEvent event) {
        try {
            log.debug("[OA监听] 任务完成: instanceId={}, taskId={}, action={}, 操作人={}",
                    event.getInstanceId(), event.getTaskId(),
                    event.getAction(), event.getOperatorName());
            // 扩展点：记录到业务审批轨迹表
            // 示例：auditTrailService.record(event.getInstanceId(), event.getAction(), event.getComment());
        } catch (Exception e) {
            log.error("[OA监听] 处理任务完成记录失败: {}", e.getMessage(), e);
        }
    }
}
