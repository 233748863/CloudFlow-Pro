package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.domain.dto.PerformanceAssignmentChildrenDTO;
import com.cloudflow.hr.domain.dto.PerformanceObjectiveCreateDTO;
import com.cloudflow.hr.domain.dto.PerformanceObjectiveQueryDTO;
import com.cloudflow.hr.domain.dto.PerformanceResultUpdateDTO;
import com.cloudflow.hr.domain.dto.PerformanceSalaryAdjustmentCreateDTO;
import com.cloudflow.hr.domain.vo.PerformanceObjectiveVO;
import com.cloudflow.hr.domain.vo.PerformanceOverviewVO;
import com.cloudflow.hr.service.PerformanceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Slf4j
@RestController
@RequestMapping("/performance")
@RequiredArgsConstructor
@SaCheckLogin
public class PerformanceController {

    private final PerformanceService performanceService;

    @PostMapping("/objective")
    @SaCheckPermission("hr:performance:create")
    public R<Long> createObjective(@Valid @RequestBody PerformanceObjectiveCreateDTO dto) {
        return R.ok(performanceService.createObjective(dto));
    }

    @GetMapping("/objective/list")
    @SaCheckPermission("hr:performance:list")
    public R<Page<PerformanceObjectiveVO>> listObjectives(PerformanceObjectiveQueryDTO query) {
        return R.ok(performanceService.listObjectives(query));
    }

    @GetMapping("/objective/{id}")
    @SaCheckPermission("hr:performance:list")
    public R<PerformanceObjectiveVO> getObjective(@PathVariable Long id) {
        return R.ok(performanceService.getObjective(id));
    }

    @GetMapping("/objective/{id}/tree")
    @SaCheckPermission("hr:performance:list")
    public R<PerformanceObjectiveVO> getObjectiveTree(@PathVariable Long id) {
        return R.ok(performanceService.getObjectiveTree(id));
    }

    @GetMapping("/overview")
    @SaCheckPermission("hr:performance:list")
    public R<PerformanceOverviewVO> getOverview() {
        return R.ok(performanceService.getOverview());
    }

    @PostMapping("/assignment/{parentId}/children")
    @SaCheckPermission("hr:performance:split")
    public R<Void> saveAssignmentChildren(
            @PathVariable Long parentId,
            @Valid @RequestBody PerformanceAssignmentChildrenDTO dto
    ) {
        performanceService.saveAssignmentChildren(parentId, dto);
        return R.ok();
    }

    @PostMapping("/result")
    @SaCheckPermission("hr:performance:result")
    public R<Void> updateResult(@Valid @RequestBody PerformanceResultUpdateDTO dto) {
        performanceService.updateResult(dto);
        return R.ok();
    }

    @PostMapping("/objective/{id}/submit-plan")
    @SaCheckPermission("hr:performance:submit")
    public R<Void> submitPlan(@PathVariable Long id) {
        performanceService.submitPlan(id);
        return R.ok();
    }

    @PostMapping("/objective/{id}/submit-result")
    @SaCheckPermission("hr:performance:submit")
    public R<Void> submitResult(@PathVariable Long id) {
        performanceService.submitResult(id);
        return R.ok();
    }

    @PostMapping("/objective/{id}/salary-adjustment")
    @SaCheckPermission("hr:performance:salary")
    public R<Long> createSalaryAdjustment(
            @PathVariable Long id,
            @Valid @RequestBody PerformanceSalaryAdjustmentCreateDTO dto
    ) {
        return R.ok(performanceService.createSalaryAdjustment(id, dto));
    }
}
