package com.cloudflow.workflow.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.workflow.callback.registry.BusinessTypeDef;
import com.cloudflow.common.workflow.callback.registry.BusinessTypeRegistry;
import com.cloudflow.workflow.domain.WfFormDefinition;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.dto.InstanceIdRequest;
import com.cloudflow.workflow.domain.dto.ProcessStartReq;
import com.cloudflow.workflow.domain.dto.ProcessRejectRequest;
import com.cloudflow.workflow.domain.dto.SignatureChangeRequest;
import com.cloudflow.workflow.domain.dto.TaskCompleteReq;
import com.cloudflow.workflow.domain.dto.TerminateProcessRequest;
import com.cloudflow.workflow.domain.dto.UrgeTaskRequest;
import com.cloudflow.workflow.domain.vo.DynamicMapVO;
import com.cloudflow.workflow.service.ITaskStatisticsService;
import com.cloudflow.workflow.service.IWfDefinitionService;
import com.cloudflow.workflow.service.IWfFormService;
import com.cloudflow.workflow.service.IWfInstanceService;
import com.cloudflow.workflow.service.IWfTaskService;
import com.cloudflow.workflow.service.WorkflowStatisticsService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaCheckLogin;

@RestController
@RequestMapping("/wf")
public class WorkflowController {

    @Autowired
    private IWfInstanceService wfInstanceService;

    @Autowired
    private IWfTaskService wfTaskService;

    @Autowired
    private IWfDefinitionService wfDefinitionService;

    @Autowired
    private IWfFormService wfFormService;

    @Autowired
    private ITaskStatisticsService taskStatisticsService;

    @Autowired
    private WorkflowStatisticsService statisticsService;

    @Autowired
    private BusinessTypeRegistry businessTypeRegistry;

    /**
     * 查询全量业务类型注册项。
     * 供前端 BusinessTypeSelector / 监控面板下拉框使用。所有已登录用户可读。
     */
    @GetMapping("/business-types")
    @SaCheckLogin
    public R<java.util.Collection<BusinessTypeDef>> listBusinessTypes() {
        return R.ok(businessTypeRegistry.all());
    }

    /**
     * 发起流程
     * 所有已认证用户均可发起流程
     */
    @PostMapping("/start")
    @SaCheckPermission("workflow:process:start")
    public R<?> startProcess(@RequestBody ProcessStartReq req) {
        return wfInstanceService.startProcess(req.getProcessDefKey(), req.getBusinessKey(), req.getVariables());
    }

    /**
     * 完成任务
     * 所有已认证用户均可处理分配给自己的任务
     */
    @PostMapping("/complete")
    @SaCheckPermission("workflow:task:complete")
    public R<?> completeTask(@RequestBody TaskCompleteReq req) {
        return wfTaskService.completeTask(req.getTaskId(), req.getAction(), req.getComment(), req.getVariables(), req.getDelegateUserId());
    }

    /**
     * 查询我的待办
     */
    @GetMapping("/todo")
    @SaCheckPermission("workflow:task:todo")
    public R<PageResult<WfTask>> getTodoTasks(@ModelAttribute PageQuery pageQuery) {
        Long userId = UserContext.getUserId();
        return R.ok(wfTaskService.getTodoTasks(userId, pageQuery));
    }

    /**
     * 查询我的已办
     */
    @GetMapping("/done")
    @SaCheckPermission("workflow:task:done")
    public R<PageResult<WfTask>> getDoneTasks(@ModelAttribute PageQuery pageQuery) {
        Long userId = UserContext.getUserId();
        return R.ok(wfTaskService.getDoneTasks(userId, pageQuery));
    }
    
    /**
     * 查询我的申请
     */
    @GetMapping("/my-instances")
    @SaCheckPermission("workflow:process:mine")
    public R<PageResult<WfProcessInstance>> getMyInstances(@ModelAttribute PageQuery pageQuery) {
        Long userId = UserContext.getUserId();
        return R.ok(wfInstanceService.getMyInstances(userId, pageQuery));
    }

    /**
     * 查询实例详情
     */
    @GetMapping("/instance/{instanceId}")
    @SaCheckPermission("workflow:process:view")
    public R<WfProcessInstance> getProcessInstance(@PathVariable("instanceId") String instanceId) {
        return R.ok(wfInstanceService.getProcessInstance(instanceId));
    }

    /**
     * 查询流程追踪
     */
    @GetMapping("/instance/{instanceId}/trace")
    @SaCheckPermission("workflow:process:view")
    public R<DynamicMapVO> getProcessTrace(@PathVariable("instanceId") String instanceId) {
        return R.ok(wfInstanceService.getProcessTrace(instanceId));
    }

    /**
     * 查询流程定义列表
     */
    @GetMapping("/definitions")
    @SaCheckPermission("workflow:definition:list")
    public R<PageResult<WfProcessDefinition>> listProcessDefinitions(@ModelAttribute PageQuery pageQuery) {
        return R.ok(wfDefinitionService.listProcessDefinitions(pageQuery));
    }

    /**
     * 查询表单定义
     */
    @GetMapping("/form/{formId}")
    @SaCheckPermission("workflow:form:view")
    public R<WfFormDefinition> getFormDefinition(@PathVariable("formId") String formId) {
        return R.ok(wfFormService.getFormDefinition(formId));
    }

    /**
     * 查询所有表单
     */
    @GetMapping("/forms")
    @SaCheckPermission("workflow:form:list")
    public R<PageResult<WfFormDefinition>> listFormDefinitions(@ModelAttribute PageQuery pageQuery) {
        return R.ok(wfFormService.listFormDefinitions(pageQuery));
    }

    /**
     * 保存流程定义
     * 仅管理员可操作
     */
    @RepeatSubmit
    @PostMapping("/definition/save")
    @SaCheckPermission("workflow:definition:add")
    public R<?> saveProcessDefinition(@RequestBody WfProcessDefinition definition) {
        return wfDefinitionService.saveProcessDefinition(definition);
    }

    /**
     * 发布流程定义
     * 仅管理员可操作
     */
    @RepeatSubmit
    @PostMapping("/definition/deploy/{definitionId}")
    @SaCheckPermission("workflow:definition:deploy")
    public R<?> deployProcessDefinition(@PathVariable("definitionId") String definitionId) {
        return wfDefinitionService.deployProcessDefinition(definitionId);
    }

    /**
     * 保存表单定义
     * 仅管理员可操作
     */
    @RepeatSubmit
    @PostMapping("/form/save")
    @SaCheckPermission("workflow:form:add")
    public R<?> saveFormDefinition(@RequestBody WfFormDefinition definition) {
        return wfFormService.saveFormDefinition(definition);
    }

    /**
     * 任务已读
     */
    @PostMapping("/task/read/{taskId}")
    @SaCheckPermission("workflow:task:read")
    public R<?> readTask(@PathVariable("taskId") String taskId) {
        wfTaskService.readTask(taskId, UserContext.getUserId());
        return R.ok();
    }

    /**
     * 催办任务
     */
    @PostMapping("/task/urge")
    @SaCheckPermission("workflow:task:urge")
    public R<?> urgeTask(@RequestBody UrgeTaskRequest dto) {
        return wfTaskService.urgeTask(dto.getTaskId(), dto.getReason());
    }

    /**
     * 获取任务统计
     * 返回待办任务数量、已办任务数量、发起的流程数量
     */
    @GetMapping("/tasks/count")
    @SaCheckPermission("workflow:task:count")
    public R<DynamicMapVO> getTasksCount() {
        Long userId = UserContext.getUserId();
        return R.ok(DynamicMapVO.from(taskStatisticsService.getTasksCount(userId)));
    }

    /**
     * 获取流程监控指标
     * 用于工作流监控大屏，仅管理员和经理可查看
     */
    @GetMapping("/statistics/metrics")
    @SaCheckPermission("workflow:task:statistics")
    public R<DynamicMapVO> getStatisticsMetrics() {
        return R.ok(DynamicMapVO.from(statisticsService.getMetrics()));
    }

    /**
     * 获取流程统计分析
     * 用于工作流监控大屏，仅管理员和经理可查看
     */
    @GetMapping("/statistics/analysis")
    @SaCheckPermission("workflow:task:statistics")
    public R<DynamicMapVO> getStatisticsAnalysis() {
        return R.ok(DynamicMapVO.from(statisticsService.getStatisticsAnalysis()));
    }

    /**
     * 删除流程定义
     * 检查是否有运行中的实例，有历史实例则归档，无历史实例则物理删除
     * 仅管理员可操作
     */
    @DeleteMapping("/definition/{definitionId}")
    @SaCheckPermission("workflow:definition:remove")
    public R<?> deleteProcessDefinition(@PathVariable("definitionId") String definitionId) {
        return wfDefinitionService.deleteProcessDefinition(definitionId);
    }

    /**
     * 获取任务统计详情
     * 包括按时间段、状态、流程类型、处理人的统计，以及平均处理时长和完成率
     */
    @GetMapping("/tasks/statistics")
    @SaCheckPermission("workflow:task:statistics")
    public R<DynamicMapVO> getTaskStatistics(
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime) {
        try {
            java.time.LocalDateTime start = parseDateTimeParam(startTime, false);
            java.time.LocalDateTime end = parseDateTimeParam(endTime, true);
            return R.ok(taskStatisticsService.getTaskStatistics(UserContext.getUserId(), start, end));
        } catch (IllegalArgumentException ex) {
            return R.fail("时间参数格式错误，请使用 yyyy-MM-dd 或 yyyy-MM-ddTHH:mm:ss");
        }
    }

    @GetMapping("/admin/tasks/statistics")
    @SaCheckPermission("workflow:task:admin-statistics")
    public R<DynamicMapVO> getAdminTaskStatistics(
            @RequestParam(required = false) Long userId,
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime) {
        try {
            java.time.LocalDateTime start = parseDateTimeParam(startTime, false);
            java.time.LocalDateTime end = parseDateTimeParam(endTime, true);
            return R.ok(taskStatisticsService.getAdminTaskStatistics(userId, start, end));
        } catch (IllegalArgumentException ex) {
            return R.fail("时间参数格式错误，请使用 yyyy-MM-dd 或 yyyy-MM-ddTHH:mm:ss");
        }
    }

    /**
     * 获取任务分组信息
     * 按流程类型、状态、优先级、处理人等维度分组
     */
    @GetMapping("/tasks/groups")
    @SaCheckPermission("workflow:task:groups")
    public R<DynamicMapVO> getTaskGroups() {
        return R.ok(taskStatisticsService.getTaskGroups(UserContext.getUserId()));
    }

    @GetMapping("/admin/tasks/groups")
    @SaCheckPermission("workflow:task:admin-statistics")
    public R<DynamicMapVO> getAdminTaskGroups(@RequestParam(required = false) Long userId) {
        return R.ok(taskStatisticsService.getAdminTaskGroups(userId));
    }

    /**
     * 撤回流程
     * 发起人可以在流程未结束前撤回自己发起的流程
     */
    @PostMapping("/recall")
    @SaCheckPermission("workflow:process:recall")
    public R<?> recallProcess(@RequestBody InstanceIdRequest dto) {
        String instanceId = dto.getInstanceId();
        if (instanceId == null || instanceId.isBlank()) {
            return R.fail("instanceId不能为空");
        }
        return wfInstanceService.recallProcess(instanceId);
    }

    /**
     * 驳回任务到指定节点
     */
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/reject")
    @SaCheckPermission("workflow:task:reject")
    public R<?> rejectTask(@RequestBody ProcessRejectRequest dto) {
        String taskId = dto.getTaskId();
        String targetNodeKey = dto.getTargetNodeKey();
        String comment = dto.getComment();
        if (taskId == null || taskId.isBlank()) {
            return R.fail("taskId不能为空");
        }
        return wfTaskService.rejectTask(taskId, targetNodeKey, comment);
    }

    /**
     * 暂停流程
     * 仅管理员可操作
     */
    @RepeatSubmit
    @PostMapping("/pause")
    @SaCheckPermission("workflow:process:pause")
    public R<?> pauseProcess(@RequestBody InstanceIdRequest dto) {
        String instanceId = dto.getInstanceId();
        if (instanceId == null || instanceId.isBlank()) {
            return R.fail("instanceId不能为空");
        }
        return wfInstanceService.pauseProcess(instanceId);
    }

    /**
     * 恢复流程
     * 仅管理员可操作
     */
    @RepeatSubmit
    @PostMapping("/resume")
    @SaCheckPermission("workflow:process:resume")
    public R<?> resumeProcess(@RequestBody InstanceIdRequest dto) {
        String instanceId = dto.getInstanceId();
        if (instanceId == null || instanceId.isBlank()) {
            return R.fail("instanceId不能为空");
        }
        return wfInstanceService.resumeProcess(instanceId);
    }

    /**
     * 查询流程定义详情
     */
    @GetMapping("/definition/{definitionId}")
    @SaCheckPermission("workflow:definition:view")
    public R<WfProcessDefinition> getProcessDefinition(@PathVariable("definitionId") String definitionId) {
        return R.ok(wfDefinitionService.getProcessDefinition(definitionId));
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
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/task/add-signature")
    @SaCheckPermission("workflow:task:add-sign")
    public R<?> addSignature(@RequestBody SignatureChangeRequest dto) {
        String taskId = dto.getTaskId();
        java.util.List<Long> userIds = dto.getUserIds();
        String comment = dto.getComment();

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
    @SaCheckPermission("workflow:task:reduce-sign")
    public R<?> reductionSignature(@RequestBody SignatureChangeRequest dto) {
        String taskId = dto.getTaskId();
        java.util.List<Long> userIds = dto.getUserIds();
        String comment = dto.getComment();

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
    @RepeatSubmit
    @PostMapping("/instance/terminate")
    @SaCheckPermission("workflow:process:terminate")
    public R<?> terminateProcess(@RequestBody TerminateProcessRequest dto) {
        String instanceId = dto.getInstanceId();
        String reason = dto.getReason();

        if (instanceId == null || instanceId.isBlank()) {
            return R.fail("流程实例ID不能为空");
        }
        if (reason == null || reason.isBlank()) {
            return R.fail("终止原因不能为空");
        }

        return wfInstanceService.terminateProcess(instanceId, reason);
    }

    private java.time.LocalDateTime parseDateTimeParam(String value, boolean endOfDay) {
        if (value == null || value.isBlank()) {
            return null;
        }

        String trimmed = value.trim();
        try {
            return java.time.LocalDateTime.parse(trimmed);
        } catch (java.time.format.DateTimeParseException ignore) {
            try {
                java.time.LocalDate date = java.time.LocalDate.parse(trimmed);
                return endOfDay ? date.atTime(23, 59, 59) : date.atStartOfDay();
            } catch (java.time.format.DateTimeParseException ex) {
                throw new IllegalArgumentException("时间参数格式错误，请使用 yyyy-MM-dd 或 yyyy-MM-ddTHH:mm:ss");
            }
        }
    }

}
