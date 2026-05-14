package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckLogin;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
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
import com.cloudflow.hr.service.HrPerformanceService;
import com.cloudflow.hr.service.HrTypedCrudService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/performance")
@RequiredArgsConstructor
@SaCheckLogin
class HrPerformanceObjectiveCrudController {

    private final HrTypedCrudService crudService;

    @GetMapping("/objectives")
    public R<?> listPerformanceObjectives(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.page(HrPerformanceObjective.class, query));
    }

    @SysLog("新增HR绩效目标")
    @PostMapping("/objectives")
    public R<Long> createPerformanceObjective(@RequestBody HrPerformanceObjectivePayload payload) {
        return R.ok(crudService.create(HrPerformanceObjective.class, payload));
    }

    @SysLog("变更HR绩效目标状态")
    @PostMapping("/objectives/{id}/{action}")
    public R<Void> changePerformanceObjectiveStatus(@PathVariable Long id, @PathVariable String action) {
        crudService.changeStatus(HrPerformanceObjective.class, id, action);
        return R.ok();
    }
}

@RestController
@RequestMapping("/performance")
@RequiredArgsConstructor
@SaCheckLogin
class HrPerformanceAssignmentController {

    private final HrTypedCrudService crudService;
    private final HrPerformanceService performanceService;

    @GetMapping("/assignments")
    public R<?> listPerformanceAssignments(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list(HrPerformanceAssignment.class, query));
    }

    @SysLog("新增HR绩效分解")
    @PostMapping("/assignments")
    public R<Long> createPerformanceAssignment(@RequestBody HrPerformanceAssignmentPayload payload) {
        return R.ok(crudService.create(HrPerformanceAssignment.class, payload));
    }

    @SysLog("保存HR绩效分解子任务")
    @PostMapping("/assignment/{parentId}/children")
    public R<Void> savePerformanceAssignmentChildren(@PathVariable Long parentId, @RequestBody HrPerformanceSplitPayload payload) {
        performanceService.saveAssignmentChildren(parentId, payload);
        return R.ok();
    }
}

@RestController
@RequestMapping("/performance")
@RequiredArgsConstructor
@SaCheckLogin
class HrPerformanceResultController {

    private final HrTypedCrudService crudService;
    private final HrPerformanceService performanceService;

    @GetMapping("/results")
    public R<?> listPerformanceResults(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list(HrPerformanceResult.class, query));
    }

    @SysLog("新增HR绩效结果")
    @PostMapping("/results")
    public R<Long> createPerformanceResult(@RequestBody HrPerformanceResultPayload payload) {
        return R.ok(crudService.create(HrPerformanceResult.class, payload));
    }

    @SysLog("更新HR绩效实绩")
    @PostMapping("/result")
    public R<Void> updatePerformanceResultV2(@RequestBody HrPerformanceResultUpdatePayload payload) {
        performanceService.updateResult(payload);
        return R.ok();
    }
}

@RestController
@RequestMapping("/performance")
@RequiredArgsConstructor
@SaCheckLogin
class HrPerformanceSalaryAdjustmentController {

    private final HrTypedCrudService crudService;
    private final HrPerformanceService performanceService;

    @GetMapping("/salary-adjustments")
    public R<?> listPerformanceSalaryAdjustments(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list(HrPerformanceSalaryAdjustment.class, query));
    }

    @SysLog("新增HR绩效调薪记录")
    @PostMapping("/salary-adjustments")
    public R<Long> createPerformanceSalaryAdjustment(@RequestBody HrPerformanceSalaryAdjustmentPayload payload) {
        return R.ok(crudService.create(HrPerformanceSalaryAdjustment.class, payload));
    }

    @SysLog("创建HR绩效调薪申请")
    @PostMapping("/objective/{id}/salary-adjustment")
    public R<Long> createPerformanceSalaryAdjustmentV2(@PathVariable Long id, @RequestBody HrPerformanceSalaryAdjustmentRequest payload) {
        return R.ok(performanceService.createSalaryAdjustment(id, payload));
    }
}

@RestController
@RequestMapping("/performance")
@RequiredArgsConstructor
@SaCheckLogin
class HrPerformanceObjectiveController {

    private final HrPerformanceService performanceService;

    @SysLog("新增HR绩效目标树")
    @PostMapping("/objective")
    public R<Long> createPerformanceObjectiveV2(@RequestBody HrPerformanceObjectiveTreePayload payload) {
        return R.ok(performanceService.createObjective(payload));
    }

    @GetMapping("/objective/list")
    public R<?> listPerformanceObjectiveV2(@RequestParam Map<String, Object> query) {
        return R.ok(performanceService.listObjectives(query));
    }

    @GetMapping("/objective/{id}")
    public R<?> getPerformanceObjective(@PathVariable Long id) {
        return R.ok(performanceService.getObjectiveTree(id));
    }

    @GetMapping("/objective/{id}/tree")
    public R<?> getPerformanceObjectiveTree(@PathVariable Long id) {
        return R.ok(performanceService.getObjectiveTree(id));
    }

    @GetMapping("/overview")
    public R<?> getPerformanceOverview() {
        return R.ok(performanceService.getOverview());
    }

    @SysLog("提交HR绩效计划")
    @PostMapping("/objective/{id}/submit-plan")
    public R<Void> submitPerformancePlan(@PathVariable Long id) {
        performanceService.submitPlan(id);
        return R.ok();
    }

    @SysLog("提交HR绩效结果")
    @PostMapping("/objective/{id}/submit-result")
    public R<Void> submitPerformanceResultV2(@PathVariable Long id) {
        performanceService.submitResult(id);
        return R.ok();
    }
}
