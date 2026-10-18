package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.*;
import com.cloudflow.oa.domain.dto.*;
import com.cloudflow.oa.service.impl.*;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/asset")
@RequiredArgsConstructor
public class AssetLifecycleController {
    private final OaAssetRegistryService registry;
    private final OaDepreciationService depreciation;
    private final OaAssetOperationsService operations;
    private final OaAssetMaintenanceService maintenance;

    @PostMapping("/categories")
    @SaCheckPermission("oa:asset-category:edit")
    @SysLog("保存资产分类")
    @RepeatSubmit
    public R<Long> saveCategory(@Valid @RequestBody OaAssetCategory category) { return R.ok(registry.saveCategory(category)); }

    @DeleteMapping("/categories/{id}")
    @SaCheckPermission("oa:asset-category:remove")
    @SysLog("删除资产分类")
    public R<Void> removeCategory(@PathVariable Long id) { registry.removeCategory(id); return R.ok(); }

    @GetMapping("/{id}/depreciation")
    @SaCheckPermission("oa:asset-depreciation:list")
    public R<List<OaAssetDepreciationSchedule>> schedules(@PathVariable Long id) { return R.ok(depreciation.schedules(id)); }

    @GetMapping("/{id}/depreciation/preview")
    @SaCheckPermission("oa:asset-depreciation:list")
    public R<List<OaAssetDepreciationSchedule>> preview(@PathVariable Long id) { return R.ok(depreciation.preview(id)); }

    @PostMapping("/{id}/depreciation/generate")
    @SaCheckPermission("oa:asset-depreciation:generate")
    @SysLog("生成折旧计划")
    @RepeatSubmit
    public R<Void> generatePlan(@PathVariable Long id) { depreciation.generatePlan(id); return R.ok(); }

    @PostMapping("/{id}/depreciation/post")
    @SaCheckPermission("oa:asset-depreciation:post")
    @SysLog("折旧过账")
    @RepeatSubmit
    public R<Integer> postDepreciation(@PathVariable Long id) { return R.ok(depreciation.postDueAsset(id,java.time.LocalDate.now())); }

    @GetMapping("/{id}/maintenance-plans")
    @SaCheckPermission("oa:asset-maintenance:list")
    public R<List<OaAssetMaintenancePlan>> plans(@PathVariable Long id) { return R.ok(maintenance.plans(id)); }

    @PostMapping("/maintenance-plans")
    @SaCheckPermission("oa:asset-maintenance:edit")
    @SysLog("保存维保计划")
    @RepeatSubmit
    public R<Long> savePlan(@Valid @RequestBody OaAssetMaintenancePlan plan) { return R.ok(maintenance.savePlan(plan)); }

    @GetMapping("/{id}/maintenance-tasks")
    @SaCheckPermission("oa:asset-maintenance:list")
    public R<List<OaAssetMaintenanceTask>> tasks(@PathVariable Long id) { return R.ok(maintenance.tasks(id)); }

    @PostMapping("/maintenance-tasks/complete")
    @SaCheckPermission("oa:asset-maintenance:complete")
    @SysLog("完成维保任务")
    @RepeatSubmit
    public R<Void> completeTask(@Valid @RequestBody OaAssetMaintenanceTask task) { maintenance.completeTask(task); return R.ok(); }

    @GetMapping("/{id}/repairs")
    @SaCheckPermission("oa:asset-repair:list")
    public R<List<OaAssetRepair>> repairs(@PathVariable Long id) { return R.ok(operations.repairs(id)); }

    @PostMapping("/repairs")
    @SaCheckPermission("oa:asset-repair:edit")
    @SysLog("保存维修单")
    @RepeatSubmit
    public R<Long> saveRepair(@Valid @RequestBody OaAssetRepair repair) { return R.ok(operations.saveRepair(repair)); }

    @PostMapping("/repairs/{id}/complete")
    @SaCheckPermission("oa:asset-repair:complete")
    @SysLog("完成维修单")
    @RepeatSubmit
    public R<Void> completeRepair(@PathVariable Long id, @Valid @RequestBody OaDecisionDTO decision) { operations.completeRepair(id, Boolean.TRUE.equals(decision.getRepairable()), decision.getActions()); return R.ok(); }

    @GetMapping("/{id}/movements")
    @SaCheckPermission("oa:asset-movement:list")
    public R<List<OaAssetMovement>> movements(@PathVariable Long id) { return R.ok(operations.movements(id)); }

    @PostMapping("/movements")
    @SaCheckPermission("oa:asset-movement:edit")
    @SysLog("保存调拨单")
    @RepeatSubmit
    public R<Long> saveMovement(@Valid @RequestBody OaAssetMovement movement) { return R.ok(operations.saveMovement(movement)); }

    @PostMapping("/movements/{id}/execute")
    @SaCheckPermission("oa:asset-movement:execute")
    @SysLog("执行资产调拨")
    @RepeatSubmit
    public R<Void> executeMovement(@PathVariable Long id) { operations.executeMovement(id); return R.ok(); }
}
