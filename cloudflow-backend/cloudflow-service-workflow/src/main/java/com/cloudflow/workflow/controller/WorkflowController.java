package com.cloudflow.workflow.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.dto.ProcessStartReq;
import com.cloudflow.workflow.domain.dto.TaskCompleteReq;
import com.cloudflow.workflow.service.IWorkflowService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.access.prepost.PreAuthorize;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/workflow")
public class WorkflowController {

    @Autowired
    private IWorkflowService workflowService;

    /**
     * 发起流程
     */
    @PostMapping("/start")
    public R<?> startProcess(@RequestBody ProcessStartReq req) {
        return workflowService.startProcess(req.getProcessDefKey(), req.getBusinessKey(), req.getVariables());
    }

    /**
     * 完成任务
     */
    @PostMapping("/complete")
    public R<?> completeTask(@RequestBody TaskCompleteReq req) {
        return workflowService.completeTask(req.getTaskId(), req.getAction(), req.getComment(), req.getVariables());
    }

    /**
     * 查询我的待办
     */
    @GetMapping("/todo")
    public R<com.cloudflow.common.core.domain.PageResult<WfTask>> getTodoTasks(@ModelAttribute com.cloudflow.common.core.domain.PageQuery pageQuery) {
        Long userId = UserContext.getUserId();
        return R.ok(workflowService.getTodoTasks(userId, pageQuery));
    }
    
    /**
     * 查询我的申请
     */
    @GetMapping("/my-instances")
    public R<com.cloudflow.common.core.domain.PageResult<WfProcessInstance>> getMyInstances(@ModelAttribute com.cloudflow.common.core.domain.PageQuery pageQuery) {
        Long userId = UserContext.getUserId();
        return R.ok(workflowService.getMyInstances(userId, pageQuery));
    }

    /**
     * 查询实例详情
     */
    @GetMapping("/instance/{instanceId}")
    public R<WfProcessInstance> getProcessInstance(@PathVariable String instanceId) {
        return R.ok(workflowService.getProcessInstance(instanceId));
    }

    /**
     * 查询流程追踪
     */
    @GetMapping("/instance/{instanceId}/trace")
    public R<Map<String, Object>> getProcessTrace(@PathVariable String instanceId) {
        return R.ok(workflowService.getProcessTrace(instanceId));
    }

    /**
     * 查询流程定义列表
     */
    @GetMapping("/definitions")
    public R<com.cloudflow.common.core.domain.PageResult<com.cloudflow.workflow.domain.WfProcessDefinition>> listProcessDefinitions(@ModelAttribute com.cloudflow.common.core.domain.PageQuery pageQuery) {
        return R.ok(workflowService.listProcessDefinitions(pageQuery));
    }

    /**
     * 查询表单定义
     */
    @GetMapping("/form/{formId}")
    public R<com.cloudflow.workflow.domain.WfFormDefinition> getFormDefinition(@PathVariable String formId) {
        return R.ok(workflowService.getFormDefinition(formId));
    }

    /**
     * 查询所有表单
     */
    @GetMapping("/forms")
    public R<com.cloudflow.common.core.domain.PageResult<com.cloudflow.workflow.domain.WfFormDefinition>> listFormDefinitions(@ModelAttribute com.cloudflow.common.core.domain.PageQuery pageQuery) {
        return R.ok(workflowService.listFormDefinitions(pageQuery));
    }

    /**
     * 保存流程定义
     */
    @PostMapping("/definition/save")
    @PreAuthorize("hasRole('ADMIN')")
    public R<?> saveProcessDefinition(@RequestBody com.cloudflow.workflow.domain.WfProcessDefinition definition) {
        return workflowService.saveProcessDefinition(definition);
    }

    /**
     * 发布流程定义
     */
    @PostMapping("/definition/deploy/{definitionId}")
    @PreAuthorize("hasRole('ADMIN')")
    public R<?> deployProcessDefinition(@PathVariable String definitionId) {
        return workflowService.deployProcessDefinition(definitionId);
    }

    /**
     * 保存表单定义
     */
    @PostMapping("/form/save")
    public R<?> saveFormDefinition(@RequestBody com.cloudflow.workflow.domain.WfFormDefinition definition) {
        return workflowService.saveFormDefinition(definition);
    }

    /**
     * 任务已读
     */
    @PostMapping("/task/read/{taskId}")
    public R<?> readTask(@PathVariable String taskId) {
        workflowService.readTask(taskId, UserContext.getUserId());
        return R.ok();
    }

    /**
     * 催办任务
     */
    @PostMapping("/task/urge")
    public R<?> urgeTask(@RequestBody Map<String, String> body) {
        String taskId = body.get("taskId");
        String reason = body.get("reason");
        return workflowService.urgeTask(taskId, reason);
    }
}
