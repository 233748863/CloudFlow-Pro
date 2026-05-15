package com.cloudflow.oa.controller;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.SysVehicle;
import com.cloudflow.oa.domain.VehicleExpense;
import com.cloudflow.oa.domain.VehicleMaintenance;
import com.cloudflow.oa.domain.VehicleUsage;
import com.cloudflow.oa.domain.VehicleViolation;
import com.cloudflow.oa.domain.dto.VehicleDispatchDTO;
import com.cloudflow.oa.domain.dto.VehicleReturnDTO;
import com.cloudflow.oa.domain.dto.VehicleUsageApprovalDTO;
import com.cloudflow.oa.domain.vo.DynamicMapVO;
import com.cloudflow.oa.domain.vo.VehicleProfileVO;
import com.cloudflow.oa.domain.vo.VehicleScheduleItemVO;
import com.cloudflow.oa.service.IVehicleExpenseService;
import com.cloudflow.oa.service.IVehicleMaintenanceService;
import com.cloudflow.oa.service.IVehicleService;
import com.cloudflow.oa.service.IVehicleUsageService;
import com.cloudflow.oa.service.IVehicleViolationService;
import lombok.RequiredArgsConstructor;
import cn.dev33.satoken.annotation.SaCheckPermission;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 车辆管理 Controller
 */
@RestController
@RequestMapping("/vehicle")
@RequiredArgsConstructor
public class VehicleController {

    private final IVehicleService vehicleService;
    private final IVehicleUsageService usageService;
    private final IVehicleExpenseService expenseService;
    private final IVehicleMaintenanceService maintenanceService;
    private final IVehicleViolationService violationService;

    // ==================== 车辆管理 ====================

    /** 车辆列表（分页） */
    @GetMapping("/list")
    @SaCheckPermission("oa:vehicle:list")
    public R<PageResult<SysVehicle>> list(SysVehicle vehicle, PageQuery pageQuery) {
        return R.ok(vehicleService.queryPage(vehicle, pageQuery));
    }

    /** 可用车辆列表 */
    @GetMapping("/available")
    @SaCheckPermission("oa:vehicle:list")
    public R<List<SysVehicle>> listAvailable() {
        return R.ok(vehicleService.listAvailable());
    }

    /** 车辆详情 */
    @GetMapping("/{id}")
    @SaCheckPermission("oa:vehicle:list")
    public R<SysVehicle> getInfo(@PathVariable("id") Long id) {
        return R.ok(vehicleService.getById(id));
    }

    /** 车辆运营详情 */
    @GetMapping("/{id}/profile")
    @SaCheckPermission("oa:vehicle:list")
    public R<VehicleProfileVO> getProfile(@PathVariable("id") Long id) {
        return R.ok(vehicleService.getVehicleProfile(id));
    }

    /** 车辆排班 */
    @GetMapping("/schedule")
    @SaCheckPermission("oa:vehicle:list")
    public R<List<VehicleScheduleItemVO>> getSchedule(@RequestParam(value = "vehicleId", required = false) Long vehicleId,
                                                      @RequestParam(value = "startDate", required = false) LocalDateTime startDate,
                                                      @RequestParam(value = "endDate", required = false) LocalDateTime endDate) {
        return R.ok(vehicleService.getVehicleSchedule(vehicleId, startDate, endDate));
    }

    /** 新增车辆 - 仅管理员 */
    @SysLog("新增车辆")
    @PostMapping
    @SaCheckPermission("oa:vehicle:add")
    public R<Void> add(@RequestBody SysVehicle vehicle) {
        return R.result(vehicleService.save(vehicle));
    }

    /** 编辑车辆 - 仅管理员 */
    @SysLog("编辑车辆")
    @PutMapping
    @SaCheckPermission("oa:vehicle:edit")
    public R<Void> edit(@RequestBody SysVehicle vehicle) {
        return R.result(vehicleService.updateById(vehicle));
    }

    /** 删除车辆 - 仅管理员 */
    @SysLog("删除车辆")
    @DeleteMapping("/{ids}")
    @SaCheckPermission("oa:vehicle:remove")
    public R<Void> remove(@PathVariable("ids") List<Long> ids) {
        return R.result(vehicleService.removeBatchByIds(ids));
    }

    /** 车辆统计概览（各状态数量） */
    @GetMapping("/stats")
    @SaCheckPermission("oa:vehicle:list")
    public R<DynamicMapVO> getVehicleStats() {
        return R.ok(DynamicMapVO.from(vehicleService.getVehicleStats()));
    }

    // ==================== 用车申请 ====================

    /** 用车记录列表（分页） */
    @GetMapping("/usage/list")
    @SaCheckPermission("oa:vehicle:usage")
    public R<PageResult<VehicleUsage>> listUsage(VehicleUsage usage, PageQuery pageQuery) {
        return R.ok(usageService.queryPage(usage, pageQuery));
    }

    /** 提交用车申请 */
    @SysLog("提交用车申请")
    @PostMapping("/usage")
    @SaCheckPermission("oa:vehicle:booking")
    public R<Void> submitUsage(@RequestBody VehicleUsage usage) {
        return usageService.submitUsage(usage);
    }

    /** 用车记录详情 */
    @GetMapping("/usage/{id}")
    @SaCheckPermission("oa:vehicle:usage")
    public R<VehicleUsage> getUsageInfo(@PathVariable("id") Long id) {
        return R.ok(usageService.getUsageDetail(id));
    }

    /** 审批用车申请 - 仅管理员/经理 */
    @SysLog("审批用车申请")
    @PutMapping("/usage/{id}/approve")
    @SaCheckPermission("oa:vehicle:approve")
    public R<Void> approveUsage(@PathVariable("id") Long id, @RequestBody VehicleUsageApprovalDTO dto) {
        String remark = dto.getRemark() == null ? "" : dto.getRemark();
        return usageService.approveUsage(id, Boolean.TRUE.equals(dto.getApproved()), remark);
    }

    /** 派车 */
    @SysLog("派车")
    @PutMapping("/usage/{id}/dispatch")
    @SaCheckPermission("oa:vehicle:dispatch")
    public R<Void> dispatchUsage(@PathVariable("id") Long id, @RequestBody VehicleDispatchDTO dto) {
        return usageService.dispatchVehicle(id, dto);
    }

    /** 归还车辆（完成用车） */
    @SysLog("归还车辆")
    @PutMapping("/usage/{id}/return")
    @SaCheckPermission("oa:vehicle:return")
    public R<Void> returnVehicle(@PathVariable("id") Long id, @RequestBody VehicleReturnDTO dto) {
        String remark = dto.getRemark() == null ? "" : dto.getRemark();
        return usageService.returnVehicle(id, dto.getEndMileage(), remark, dto.getReturnLocation());
    }

    /** 取消用车申请 */
    @SysLog("取消用车申请")
    @PutMapping("/usage/{id}/cancel")
    @SaCheckPermission("oa:vehicle:cancel")
    public R<Void> cancelUsage(@PathVariable("id") Long id) {
        return usageService.cancelUsage(id);
    }

    // ==================== 费用管理 ====================

    /** 费用列表（分页） */
    @GetMapping("/expense/list")
    @SaCheckPermission("oa:vehicle:usage")
    public R<PageResult<VehicleExpense>> listExpense(VehicleExpense expense,
                                                     PageQuery pageQuery,
                                                     @RequestParam(value = "startDate", required = false) String startDate,
                                                     @RequestParam(value = "endDate", required = false) String endDate) {
        return R.ok(expenseService.queryPage(expense, pageQuery, startDate, endDate));
    }

    /** 新增费用 */
    @SysLog("新增车辆费用")
    @PostMapping("/expense")
    @SaCheckPermission("oa:vehicle:expense:add")
    public R<Void> addExpense(@RequestBody VehicleExpense expense) {
        return R.result(expenseService.save(expense));
    }

    /** 费用统计 */
    @GetMapping("/expense/stats")
    @SaCheckPermission("oa:vehicle:usage")
    public R<DynamicMapVO> getExpenseStats(@RequestParam(value = "startDate", required = false) String startDate,
                                           @RequestParam(value = "endDate", required = false) String endDate) {
        return R.ok(DynamicMapVO.from(expenseService.getExpenseStats(startDate, endDate)));
    }

    /** 维保列表 */
    @GetMapping("/maintenance/list")
    @SaCheckPermission("oa:vehicle:list")
    public R<PageResult<VehicleMaintenance>> listMaintenance(VehicleMaintenance maintenance, PageQuery pageQuery) {
        return R.ok(maintenanceService.queryPage(maintenance, pageQuery));
    }

    /** 新增维保记录 */
    @SysLog("新增车辆维保")
    @PostMapping("/maintenance")
    @SaCheckPermission("oa:vehicle:maintenance:add")
    public R<Void> addMaintenance(@RequestBody VehicleMaintenance maintenance) {
        return R.result(maintenanceService.save(maintenance));
    }

    /** 违章列表 */
    @GetMapping("/violation/list")
    @SaCheckPermission("oa:vehicle:list")
    public R<PageResult<VehicleViolation>> listViolation(VehicleViolation violation, PageQuery pageQuery) {
        return R.ok(violationService.queryPage(violation, pageQuery));
    }

    /** 新增违章记录 */
    @SysLog("新增车辆违章")
    @PostMapping("/violation")
    @SaCheckPermission("oa:vehicle:violation:add")
    public R<Void> addViolation(@RequestBody VehicleViolation violation) {
        return R.result(violationService.save(violation));
    }
}

