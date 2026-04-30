package com.cloudflow.workflow.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.dto.AddSignReq;
import com.cloudflow.workflow.domain.dto.RemoveSignReq;
import com.cloudflow.workflow.domain.dto.DelegateTaskReq;
import com.cloudflow.workflow.domain.dto.ProcessInvalidateRequest;
import com.cloudflow.workflow.service.IWorkflowP4Service;
import com.cloudflow.workflow.service.IWfInstanceService;
import com.cloudflow.workflow.service.IWfDefinitionService;
import org.springframework.beans.factory.annotation.Autowired;
import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaCheckRole;
import cn.dev33.satoken.annotation.SaMode;
import org.springframework.web.bind.annotation.*;

/**
 * P1 增强功能控制器
 * 包含：加签/减签、委派优化、流程图数据、作废流程
 */
@RestController
@RequestMapping("/enhance")
public class WorkflowEnhanceController {

    @Autowired
    private IWorkflowP4Service p4Service;

    @Autowired
    private IWfInstanceService instanceService;

    @Autowired
    private IWfDefinitionService definitionService;

    // ==================== P1-4: 加签/减签 ====================

    /**
     * 加签
     * 支持三种模式：BEFORE(前加签)、AFTER(后加签)、PARALLEL(并行加签)
     */
    @PostMapping("/task/addSign")
    @SaCheckLogin
    public R<?> addSign(@RequestBody AddSignReq req) {
        return p4Service.addSign(req.getTaskId(), req.getUserIds(), req.getUserNames(),
                req.getSignType(), req.getReason());
    }

    /**
     * 减签
     * 移除已加签但尚未处理的审批人
     */
    @PostMapping("/task/removeSign")
    @SaCheckLogin
    public R<?> removeSign(@RequestBody RemoveSignReq req) {
        return p4Service.removeSign(req.getTaskId(), req.getUserIds(), req.getReason());
    }

    // ==================== P1-5: 委派功能优化 ====================

    /**
     * 委派/转办任务
     * TRANSFER模式：直接转办，任务完全移交
     * DELEGATE模式：委派审批，处理后自动回到委派人
     */
    @PostMapping("/task/delegate")
    @SaCheckLogin
    public R<?> delegateTask(@RequestBody DelegateTaskReq req) {
        String mode = req.getMode();
        if (mode == null || mode.isBlank()) {
            mode = "TRANSFER"; // 默认直接转办，向后兼容
        }

        if ("DELEGATE".equals(mode)) {
            // 委派模式：目标用户处理后任务自动回到委派人
            return p4Service.delegateWithReturn(req.getTaskId(), req.getToUserId(),
                    req.getToUserName(), req.getReason());
        } else {
            // 转办模式：直接移交
            return p4Service.delegateTask(req.getTaskId(), req.getToUserId(),
                    req.getToUserName(), req.getReason());
        }
    }

    // ==================== P1-6: 流程图数据接口 ====================

    /**
     * 获取流程图渲染数据
     * 返回节点列表（含坐标、状态）和连线列表，供前端流程图组件渲染
     */
    @GetMapping("/flowchart/{instanceId}")
    @SaCheckLogin
    public R<?> getFlowchartData(@PathVariable("instanceId") String instanceId) {
        return R.ok(instanceService.getFlowchartData(instanceId));
    }

    /**
     * 获取流程定义的流程图结构
     * 仅返回定义级别的节点和连线，不含运行时状态
     */
    @GetMapping("/flowchart/definition/{definitionId}")
    @SaCheckLogin
    public R<?> getDefinitionFlowchart(@PathVariable("definitionId") String definitionId) {
        return R.ok(definitionService.getFlowchartStructure(definitionId));
    }

    // ==================== P1-7: 作废流程 ====================

    /**
     * 作废流程实例
     * 管理员可作废任何运行中的流程，作废后流程终止且不可恢复
     */
    @PostMapping("/instance/invalidate")
    @SaCheckRole("admin")
    public R<?> invalidateProcess(@RequestBody ProcessInvalidateRequest dto) {
        String instanceId = dto.getInstanceId();
        String reason = dto.getReason();
        if (instanceId == null || instanceId.isBlank()) {
            return R.fail("instanceId不能为空");
        }
        if (reason == null || reason.isBlank()) {
            return R.fail("作废原因不能为空");
        }
        return instanceService.invalidateProcess(instanceId, reason);
    }
}
