package com.cloudflow.workflow.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.dto.ProcessStartReq;
import com.cloudflow.workflow.domain.dto.TaskCompleteReq;
import com.cloudflow.workflow.service.IWorkflowService;
import com.cloudflow.workflow.service.WorkflowStatisticsService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.access.prepost.PreAuthorize;

import java.util.List;
import java.util.Map;

@RestController
public class WorkflowController {

    @Autowired
    private IWorkflowService workflowService;

    @Autowired
    private WorkflowStatisticsService statisticsService;

    @Autowired
    private com.cloudflow.workflow.service.IWfTaskService wfTaskService;

    /**
     * 发起流程
     * 所有已认证用户均可发起流程
     */
    @PostMapping("/start")
    @PreAuthorize("isAuthenticated()")
    public R<?> startProcess(@RequestBody ProcessStartReq req) {
        return workflowService.startProcess(req.getProcessDefKey(), req.getBusinessKey(), req.getVariables());
    }

    /**
     * 完成任务
     * 所有已认证用户均可处理分配给自己的任务
     */
    @PostMapping("/complete")
    @PreAuthorize("isAuthenticated()")
    public R<?> completeTask(@RequestBody TaskCompleteReq req) {
        return workflowService.completeTask(req.getTaskId(), req.getAction(), req.getComment(), req.getVariables(), req.getDelegateUserId());
    }

    /**
     * 查询我的待办
     */
    @GetMapping("/todo")
    @PreAuthorize("isAuthenticated()")
    public R<com.cloudflow.common.core.domain.PageResult<WfTask>> getTodoTasks(@ModelAttribute com.cloudflow.common.core.domain.PageQuery pageQuery) {
        Long userId = UserContext.getUserId();
        return R.ok(workflowService.getTodoTasks(userId, pageQuery));
    }
    
    /**
     * 查询我的申请
     */
    @GetMapping("/my-instances")
    @PreAuthorize("isAuthenticated()")
    public R<com.cloudflow.common.core.domain.PageResult<WfProcessInstance>> getMyInstances(@ModelAttribute com.cloudflow.common.core.domain.PageQuery pageQuery) {
        Long userId = UserContext.getUserId();
        return R.ok(workflowService.getMyInstances(userId, pageQuery));
    }

    /**
     * 查询实例详情
     */
    @GetMapping("/instance/{instanceId}")
    @PreAuthorize("isAuthenticated()")
    public R<WfProcessInstance> getProcessInstance(@PathVariable("instanceId") String instanceId) {
        return R.ok(workflowService.getProcessInstance(instanceId));
    }

    /**
     * 查询流程追踪
     */
    @GetMapping("/instance/{instanceId}/trace")
    @PreAuthorize("isAuthenticated()")
    public R<Map<String, Object>> getProcessTrace(@PathVariable("instanceId") String instanceId) {
        return R.ok(workflowService.getProcessTrace(instanceId));
    }

    /**
     * 查询流程定义列表
     */
    @GetMapping("/definitions")
    @PreAuthorize("isAuthenticated()")
    public R<com.cloudflow.common.core.domain.PageResult<com.cloudflow.workflow.domain.WfProcessDefinition>> listProcessDefinitions(@ModelAttribute com.cloudflow.common.core.domain.PageQuery pageQuery) {
        return R.ok(workflowService.listProcessDefinitions(pageQuery));
    }

    /**
     * 查询表单定义
     */
    @GetMapping("/form/{formId}")
    @PreAuthorize("isAuthenticated()")
    public R<com.cloudflow.workflow.domain.WfFormDefinition> getFormDefinition(@PathVariable("formId") String formId) {
        return R.ok(workflowService.getFormDefinition(formId));
    }

    /**
     * 查询所有表单
     */
    @GetMapping("/forms")
    @PreAuthorize("isAuthenticated()")
    public R<com.cloudflow.common.core.domain.PageResult<com.cloudflow.workflow.domain.WfFormDefinition>> listFormDefinitions(@ModelAttribute com.cloudflow.common.core.domain.PageQuery pageQuery) {
        return R.ok(workflowService.listFormDefinitions(pageQuery));
    }

    /**
     * 保存流程定义
     * 仅管理员可操作
     */
    @PostMapping("/definition/save")
    @PreAuthorize("hasAnyRole('admin', 'ADMIN')")
    public R<?> saveProcessDefinition(@RequestBody com.cloudflow.workflow.domain.WfProcessDefinition definition) {
        return workflowService.saveProcessDefinition(definition);
    }

    /**
     * 发布流程定义
     * 仅管理员可操作
     */
    @PostMapping("/definition/deploy/{definitionId}")
    @PreAuthorize("hasAnyRole('admin', 'ADMIN')")
    public R<?> deployProcessDefinition(@PathVariable("definitionId") String definitionId) {
        return workflowService.deployProcessDefinition(definitionId);
    }

    /**
     * 保存表单定义
     * 仅管理员可操作
     */
    @PostMapping("/form/save")
    @PreAuthorize("hasAnyRole('admin', 'ADMIN')")
    public R<?> saveFormDefinition(@RequestBody com.cloudflow.workflow.domain.WfFormDefinition definition) {
        return workflowService.saveFormDefinition(definition);
    }

    /**
     * 任务已读
     */
    @PostMapping("/task/read/{taskId}")
    @PreAuthorize("isAuthenticated()")
    public R<?> readTask(@PathVariable("taskId") String taskId) {
        workflowService.readTask(taskId, UserContext.getUserId());
        return R.ok();
    }

    /**
     * 催办任务
     */
    @PostMapping("/task/urge")
    @PreAuthorize("isAuthenticated()")
    public R<?> urgeTask(@RequestBody Map<String, String> body) {
        String taskId = body.get("taskId");
        String reason = body.get("reason");
        return workflowService.urgeTask(taskId, reason);
    }

    /**
     * 获取任务统计
     * 返回待办任务数量、已办任务数量、发起的流程数量
     */
    @GetMapping("/tasks/count")
    @PreAuthorize("isAuthenticated()")
    public R<Map<String, Integer>> getTasksCount() {
        Long userId = UserContext.getUserId();
        return R.ok(workflowService.getTasksCount(userId));
    }

    /**
     * 获取流程监控指标
     * 用于工作流监控大屏，仅管理员和经理可查看
     */
    @GetMapping("/statistics/metrics")
    @PreAuthorize("hasAnyRole('admin', 'ADMIN', 'manager')")
    public R<Map<String, Object>> getStatisticsMetrics() {
        return R.ok(statisticsService.getMetrics());
    }

    /**
     * 获取流程统计分析
     * 用于工作流监控大屏，仅管理员和经理可查看
     */
    @GetMapping("/statistics/analysis")
    @PreAuthorize("hasAnyRole('admin', 'ADMIN', 'manager')")
    public R<Map<String, Object>> getStatisticsAnalysis() {
        return R.ok(statisticsService.getStatisticsAnalysis());
    }

    /**
     * 删除流程定义
     * 检查是否有运行中的实例，有历史实例则归档，无历史实例则物理删除
     * 仅管理员可操作
     */
    @DeleteMapping("/definition/{definitionId}")
    @PreAuthorize("hasAnyRole('admin', 'ADMIN')")
    public R<?> deleteProcessDefinition(@PathVariable("definitionId") String definitionId) {
        return workflowService.deleteProcessDefinition(definitionId);
    }

    /**
     * 获取任务统计详情
     * 包括按时间段、状态、流程类型、处理人的统计，以及平均处理时长和完成率
     */
    @GetMapping("/tasks/statistics")
    @PreAuthorize("hasAnyRole('admin', 'ADMIN', 'manager')")
    public R<Map<String, Object>> getTaskStatistics(
            @RequestParam(required = false) Long userId,
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime) {
        java.time.LocalDateTime start = startTime != null ? java.time.LocalDateTime.parse(startTime) : null;
        java.time.LocalDateTime end = endTime != null ? java.time.LocalDateTime.parse(endTime) : null;
        return R.ok(workflowService.getTaskStatistics(userId, start, end));
    }

    /**
     * 获取任务分组信息
     * 按流程类型、状态、优先级、处理人等维度分组
     */
    @GetMapping("/tasks/groups")
    @PreAuthorize("hasAnyRole('admin', 'ADMIN', 'manager')")
    public R<Map<String, Object>> getTaskGroups(@RequestParam(required = false) Long userId) {
        return R.ok(workflowService.getTaskGroups(userId));
    }

    /**
     * 撤回流程
     * 发起人可以在流程未结束前撤回自己发起的流程
     */
    @PostMapping("/recall")
    @PreAuthorize("isAuthenticated()")
    public R<?> recallProcess(@RequestBody Map<String, String> body) {
        String instanceId = body.get("instanceId");
        if (instanceId == null || instanceId.isBlank()) {
            return R.fail("instanceId不能为空");
        }
        return workflowService.recallProcess(instanceId);
    }

    /**
     * 驳回任务到指定节点
     */
    @PostMapping("/reject")
    @PreAuthorize("isAuthenticated()")
    public R<?> rejectTask(@RequestBody Map<String, String> body) {
        String taskId = body.get("taskId");
        String targetNodeKey = body.get("targetNodeKey");
        String comment = body.get("comment");
        if (taskId == null || taskId.isBlank()) {
            return R.fail("taskId不能为空");
        }
        return workflowService.rejectTask(taskId, targetNodeKey, comment);
    }

    /**
     * 暂停流程
     * 仅管理员可操作
     */
    @PostMapping("/pause")
    @PreAuthorize("hasAnyRole('admin', 'ADMIN')")
    public R<?> pauseProcess(@RequestBody Map<String, String> body) {
        String instanceId = body.get("instanceId");
        if (instanceId == null || instanceId.isBlank()) {
            return R.fail("instanceId不能为空");
        }
        return workflowService.pauseProcess(instanceId);
    }

    /**
     * 恢复流程
     * 仅管理员可操作
     */
    @PostMapping("/resume")
    @PreAuthorize("hasAnyRole('admin', 'ADMIN')")
    public R<?> resumeProcess(@RequestBody Map<String, String> body) {
        String instanceId = body.get("instanceId");
        if (instanceId == null || instanceId.isBlank()) {
            return R.fail("instanceId不能为空");
        }
        return workflowService.resumeProcess(instanceId);
    }

    /**
     * 查询流程定义详情
     */
    @GetMapping("/definition/{definitionId}")
    @PreAuthorize("isAuthenticated()")
    public R<com.cloudflow.workflow.domain.WfProcessDefinition> getProcessDefinition(@PathVariable("definitionId") String definitionId) {
        return R.ok(workflowService.getProcessDefinition(definitionId));
    }

    // ==================== 加签/减签功能 ====================

    /**
     * 加签（动态增加审批人）
     * 仅支持会签节点，只有任务处理人可以加签
     * 
     * @param body 请求体，包含：
     *             - taskId: 任务ID（必填）
     *             - userIds: 新增审批人ID列表（必填）
     *             - comment: 加签说明（必填）
     * @return 加签结果
     */
    @PostMapping("/task/add-signature")
    @PreAuthorize("isAuthenticated()")
    public R<?> addSignature(@RequestBody Map<String, Object> body) {
        String taskId = (String) body.get("taskId");
        @SuppressWarnings("unchecked")
        List<Long> userIds = (List<Long>) body.get("userIds");
        String comment = (String) body.get("comment");

        if (taskId == null || taskId.isBlank()) {
            return R.fail("任务ID不能为空");
        }
        if (userIds == null || userIds.isEmpty()) {
            return R.fail("加签人员列表不能为空");
        }
        if (comment == null || comment.isBlank()) {
            return R.fail("加签说明不能为空");
        }

        return wfTaskService.addSignature(taskId, userIds, comment);
    }

    /**
     * 减签（动态减少审批人）
     * 仅支持会签节点，任务处理人或管理员可以减签
     * 
     * @param body 请求体，包含：
     *             - taskId: 任务ID（必填）
     *             - userIds: 要移除的审批人ID列表（必填）
     *             - comment: 减签说明（必填）
     * @return 减签结果
     */
    @PostMapping("/task/reduction-signature")
    @PreAuthorize("isAuthenticated()")
    public R<?> reductionSignature(@RequestBody Map<String, Object> body) {
        String taskId = (String) body.get("taskId");
        @SuppressWarnings("unchecked")
        List<Long> userIds = (List<Long>) body.get("userIds");
        String comment = (String) body.get("comment");

        if (taskId == null || taskId.isBlank()) {
            return R.fail("任务ID不能为空");
        }
        if (userIds == null || userIds.isEmpty()) {
            return R.fail("减签人员列表不能为空");
        }
        if (comment == null || comment.isBlank()) {
            return R.fail("减签说明不能为空");
        }

        return wfTaskService.reductionSignature(taskId, userIds, comment);
    }

    // ==================== 流程终止功能 ====================

    /**
     * 终止流程
     * 管理员强制终止异常流程，与作废的区别是用于异常流程处理
     * 仅管理员可操作
     * 
     * @param body 请求体，包含：
     *             - instanceId: 流程实例ID（必填）
     *             - reason: 终止原因（必填）
     * @return 终止结果
     */
    @PostMapping("/instance/terminate")
    @PreAuthorize("hasAnyRole('admin', 'ADMIN')")
    public R<?> terminateProcess(@RequestBody Map<String, String> body) {
        String instanceId = body.get("instanceId");
        String reason = body.get("reason");

        if (instanceId == null || instanceId.isBlank()) {
            return R.fail("流程实例ID不能为空");
        }
        if (reason == null || reason.isBlank()) {
            return R.fail("终止原因不能为空");
        }

        return workflowService.terminateProcess(instanceId, reason);
    }
}
