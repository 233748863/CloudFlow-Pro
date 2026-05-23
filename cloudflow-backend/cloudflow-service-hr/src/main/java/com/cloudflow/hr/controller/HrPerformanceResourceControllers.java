package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.hr.domain.dto.Hr360EvaluatorInvitePayload;
import com.cloudflow.hr.domain.dto.Hr360EvaluatorResponsePayload;
import com.cloudflow.hr.domain.dto.HrPerfDistributionCheckPayload;
import com.cloudflow.hr.domain.dto.HrPerfDistributionRulePayload;
import com.cloudflow.hr.domain.dto.HrPerformanceAssignmentPayload;
import com.cloudflow.hr.domain.dto.HrPerformanceObjectivePayload;
import com.cloudflow.hr.domain.dto.HrPerformanceObjectiveTreePayload;
import com.cloudflow.hr.domain.dto.HrPerformanceResultPayload;
import com.cloudflow.hr.domain.dto.HrPerformanceResultUpdatePayload;
import com.cloudflow.hr.domain.dto.HrPerformanceSalaryAdjustmentPayload;
import com.cloudflow.hr.domain.dto.HrPerformanceSalaryAdjustmentRequest;
import com.cloudflow.hr.domain.dto.HrPerformanceSplitPayload;
import com.cloudflow.hr.domain.entity.HrPerformanceAssignment;
import com.cloudflow.hr.domain.entity.HrPerformanceObjective;
import com.cloudflow.hr.domain.entity.HrPerformanceResult;
import com.cloudflow.hr.domain.entity.HrPerformanceSalaryAdjustment;
import com.cloudflow.hr.service.HrPerformance360Service;
import com.cloudflow.hr.service.HrPerformanceDistributionService;
import com.cloudflow.hr.service.HrPerformanceService;
import com.cloudflow.hr.service.HrTypedCrudService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/performance")
@RequiredArgsConstructor
class HrPerformanceObjectiveCrudController {

    private final HrTypedCrudService crudService;

    @GetMapping("/objectives")
    @SaCheckPermission("hr:performance:list")
    public R<?> listPerformanceObjectives(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.page(HrPerformanceObjective.class, query));
    }

    @SysLog("新增HR绩效目标")
    @PostMapping("/objectives")
    @SaCheckPermission("hr:performance:add")
    public R<Long> createPerformanceObjective(@RequestBody HrPerformanceObjectivePayload payload) {
        return R.ok(crudService.create(HrPerformanceObjective.class, payload));
    }

    @SysLog("变更HR绩效目标状态")
    @PostMapping("/objectives/{id}/{action}")
    @SaCheckPermission("hr:performance:edit")
    public R<Void> changePerformanceObjectiveStatus(@PathVariable Long id, @PathVariable String action) {
        crudService.changeStatus(HrPerformanceObjective.class, id, action);
        return R.ok();
    }
}

@RestController
@RequestMapping("/performance")
@RequiredArgsConstructor
class HrPerformanceAssignmentController {

    private final HrTypedCrudService crudService;
    private final HrPerformanceService performanceService;

    @GetMapping("/assignments")
    @SaCheckPermission("hr:performance:list")
    public R<?> listPerformanceAssignments(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list(HrPerformanceAssignment.class, query));
    }

    @SysLog("新增HR绩效分解")
    @PostMapping("/assignments")
    @SaCheckPermission("hr:performance:add")
    public R<Long> createPerformanceAssignment(@RequestBody HrPerformanceAssignmentPayload payload) {
        return R.ok(crudService.create(HrPerformanceAssignment.class, payload));
    }

    @SysLog("保存HR绩效分解子任务")
    @PostMapping("/assignment/{parentId}/children")
    @SaCheckPermission("hr:performance:edit")
    public R<Void> savePerformanceAssignmentChildren(@PathVariable Long parentId, @RequestBody HrPerformanceSplitPayload payload) {
        performanceService.saveAssignmentChildren(parentId, payload);
        return R.ok();
    }
}

@RestController
@RequestMapping("/performance")
@RequiredArgsConstructor
class HrPerformanceResultController {

    private final HrTypedCrudService crudService;
    private final HrPerformanceService performanceService;

    @GetMapping("/results")
    @SaCheckPermission("hr:performance:list")
    public R<?> listPerformanceResults(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list(HrPerformanceResult.class, query));
    }

    @SysLog("新增HR绩效结果")
    @PostMapping("/results")
    @SaCheckPermission("hr:performance:add")
    public R<Long> createPerformanceResult(@RequestBody HrPerformanceResultPayload payload) {
        return R.ok(crudService.create(HrPerformanceResult.class, payload));
    }

    @SysLog("更新HR绩效实绩")
    @PostMapping("/result")
    @SaCheckPermission("hr:performance:edit")
    public R<Void> updatePerformanceResultV2(@RequestBody HrPerformanceResultUpdatePayload payload) {
        performanceService.updateResult(payload);
        return R.ok();
    }
}

@RestController
@RequestMapping("/performance")
@RequiredArgsConstructor
class HrPerformanceSalaryAdjustmentController {

    private final HrTypedCrudService crudService;
    private final HrPerformanceService performanceService;

    @GetMapping("/salary-adjustments")
    @SaCheckPermission("hr:performance:list")
    public R<?> listPerformanceSalaryAdjustments(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list(HrPerformanceSalaryAdjustment.class, query));
    }

    @SysLog("新增HR绩效调薪记录")
    @PostMapping("/salary-adjustments")
    @SaCheckPermission("hr:performance:add")
    public R<Long> createPerformanceSalaryAdjustment(@RequestBody HrPerformanceSalaryAdjustmentPayload payload) {
        return R.ok(crudService.create(HrPerformanceSalaryAdjustment.class, payload));
    }

    @SysLog("创建HR绩效调薪申请")
    @PostMapping("/objective/{id}/salary-adjustment")
    @SaCheckPermission("hr:performance:edit")
    public R<Long> createPerformanceSalaryAdjustmentV2(@PathVariable Long id, @RequestBody HrPerformanceSalaryAdjustmentRequest payload) {
        return R.ok(performanceService.createSalaryAdjustment(id, payload));
    }
}

@RestController
@RequestMapping("/performance")
@RequiredArgsConstructor
class HrPerformanceObjectiveController {

    private final HrPerformanceService performanceService;

    @SysLog("新增HR绩效目标树")
    @PostMapping("/objective")
    @SaCheckPermission("hr:performance:add")
    public R<Long> createPerformanceObjectiveV2(@RequestBody HrPerformanceObjectiveTreePayload payload) {
        return R.ok(performanceService.createObjective(payload));
    }

    @GetMapping("/objective/list")
    @SaCheckPermission("hr:performance:list")
    public R<?> listPerformanceObjectiveV2(@RequestParam Map<String, Object> query) {
        return R.ok(performanceService.listObjectives(query));
    }

    @GetMapping("/objective/{id}")
    @SaCheckPermission("hr:performance:view")
    public R<?> getPerformanceObjective(@PathVariable Long id) {
        return R.ok(performanceService.getObjectiveTree(id));
    }

    @GetMapping("/objective/{id}/tree")
    @SaCheckPermission("hr:performance:view")
    public R<?> getPerformanceObjectiveTree(@PathVariable Long id) {
        return R.ok(performanceService.getObjectiveTree(id));
    }

    @GetMapping("/overview")
    @SaCheckPermission("hr:performance:view")
    public R<?> getPerformanceOverview() {
        return R.ok(performanceService.getOverview());
    }

    @SysLog("提交HR绩效计划")
    @PostMapping("/objective/{id}/submit-plan")
    @SaCheckPermission("hr:performance:edit")
    public R<Void> submitPerformancePlan(@PathVariable Long id) {
        performanceService.submitPlan(id);
        return R.ok();
    }

    @SysLog("提交HR绩效结果")
    @PostMapping("/objective/{id}/submit-result")
    @SaCheckPermission("hr:performance:edit")
    public R<Void> submitPerformanceResultV2(@PathVariable Long id) {
        performanceService.submitResult(id);
        return R.ok();
    }
}

/**
 * HR-P0-1 绩效 360 度评估端点。
 */
@RestController
@RequestMapping("/performance/360")
@RequiredArgsConstructor
class HrPerformance360Controller {

    private final HrPerformance360Service service;

    @SysLog("发起HR绩效360评估邀请")
    @PostMapping("/invite")
    @SaCheckPermission("hr:performance:edit")
    public R<List<Long>> invite360(@RequestBody Hr360EvaluatorInvitePayload payload) {
        return R.ok(service.inviteEvaluators(payload));
    }

    @SysLog("提交HR绩效360评估打分")
    @PostMapping("/response")
    @SaCheckPermission("hr:performance:edit")
    public R<Void> submit360Response(@RequestBody Hr360EvaluatorResponsePayload payload) {
        service.submitResponse(payload);
        return R.ok();
    }

    @SysLog("取消HR绩效360评估邀请")
    @PostMapping("/evaluator/{id}/cancel")
    @SaCheckPermission("hr:performance:edit")
    public R<Void> cancel360Evaluator(@PathVariable Long id) {
        service.cancelEvaluator(id);
        return R.ok();
    }

    @GetMapping("/evaluators")
    @SaCheckPermission("hr:performance:view")
    public R<List<Map<String, Object>>> list360Evaluators(
            @RequestParam Long objectiveId,
            @RequestParam(required = false) Long evaluateeId) {
        return R.ok(service.listEvaluators(objectiveId, evaluateeId));
    }

    @GetMapping("/pending")
    @SaCheckPermission("hr:performance:view")
    public R<List<Map<String, Object>>> list360Pending(@RequestParam Long evaluatorId) {
        return R.ok(service.listPendingForEvaluator(evaluatorId));
    }

    @SysLog("聚合HR绩效360评估结果")
    @PostMapping("/aggregate")
    @SaCheckPermission("hr:performance:edit")
    public R<Map<String, Object>> aggregate360(@RequestParam Long objectiveId, @RequestParam Long evaluateeId) {
        return R.ok(service.aggregate(objectiveId, evaluateeId));
    }
}

/**
 * HR-P0-2 绩效强制分布端点。
 */
@RestController
@RequestMapping("/performance/distribution")
@RequiredArgsConstructor
class HrPerformanceDistributionController {

    private final HrPerformanceDistributionService service;

    @GetMapping("/rules")
    @SaCheckPermission("hr:performance:view")
    public R<List<Map<String, Object>>> listDistributionRules(@RequestParam(required = false) Long objectiveId) {
        return R.ok(service.listRules(objectiveId));
    }

    @SysLog("保存HR绩效强制分布规则")
    @PostMapping("/rules")
    @SaCheckPermission("hr:performance:edit")
    public R<Long> saveDistributionRule(@RequestBody HrPerfDistributionRulePayload payload) {
        return R.ok(service.saveRule(payload));
    }

    @SysLog("删除HR绩效强制分布规则")
    @DeleteMapping("/rules/{id}")
    @SaCheckPermission("hr:performance:edit")
    public R<Void> deleteDistributionRule(@PathVariable Long id) {
        service.deleteRule(id);
        return R.ok();
    }

    @PostMapping("/validate")
    @SaCheckPermission("hr:performance:view")
    public R<Map<String, Object>> validateDistribution(@RequestBody HrPerfDistributionCheckPayload payload) {
        return R.ok(service.validate(payload));
    }
}
