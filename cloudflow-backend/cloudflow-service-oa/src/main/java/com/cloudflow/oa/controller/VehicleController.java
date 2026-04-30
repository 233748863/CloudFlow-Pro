package com.cloudflow.oa.controller;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.SysVehicle;
import com.cloudflow.oa.domain.VehicleExpense;
import com.cloudflow.oa.domain.VehicleUsage;
import com.cloudflow.oa.domain.dto.VehicleReturnDTO;
import com.cloudflow.oa.domain.dto.VehicleUsageApprovalDTO;
import com.cloudflow.oa.domain.vo.DynamicMapVO;
import com.cloudflow.oa.service.IVehicleExpenseService;
import com.cloudflow.oa.service.IVehicleService;
import com.cloudflow.oa.service.IVehicleUsageService;
import lombok.RequiredArgsConstructor;
import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaCheckRole;
import cn.dev33.satoken.annotation.SaMode;
import org.springframework.web.bind.annotation.*;

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

    // ==================== 车辆管理 ====================

    /** 车辆列表（分页） */
    @GetMapping("/list")
    public R<PageResult<SysVehicle>> list(SysVehicle vehicle, PageQuery pageQuery) {
        return R.ok(vehicleService.queryPage(vehicle, pageQuery));
    }

    /** 可用车辆列表 */
    @GetMapping("/available")
    public R<List<SysVehicle>> listAvailable() {
        return R.ok(vehicleService.listAvailable());
    }

    /** 车辆详情 */
    @GetMapping("/{id}")
    public R<SysVehicle> getInfo(@PathVariable("id") Long id) {
        return R.ok(vehicleService.getById(id));
    }

    /** 新增车辆 - 仅管理员 */
    @SysLog("新增车辆")
    @PostMapping
    @SaCheckRole("admin")
    public R<Void> add(@RequestBody SysVehicle vehicle) {
        return R.result(vehicleService.save(vehicle));
    }

    /** 编辑车辆 - 仅管理员 */
    @SysLog("编辑车辆")
    @PutMapping
    @SaCheckRole("admin")
    public R<Void> edit(@RequestBody SysVehicle vehicle) {
        return R.result(vehicleService.updateById(vehicle));
    }

    /** 删除车辆 - 仅管理员 */
    @SysLog("删除车辆")
    @DeleteMapping("/{ids}")
    @SaCheckRole("admin")
    public R<Void> remove(@PathVariable("ids") List<Long> ids) {
        return R.result(vehicleService.removeBatchByIds(ids));
    }

    /** 车辆统计概览（各状态数量） */
    @GetMapping("/stats")
    public R<DynamicMapVO> getVehicleStats() {
        return R.ok(DynamicMapVO.from(vehicleService.getVehicleStats()));
    }

    // ==================== 用车申请 ====================

    /** 用车记录列表（分页） */
    @GetMapping("/usage/list")
    public R<PageResult<VehicleUsage>> listUsage(VehicleUsage usage, PageQuery pageQuery) {
        return R.ok(usageService.queryPage(usage, pageQuery));
    }

    /** 提交用车申请 */
    @SysLog("提交用车申请")
    @PostMapping("/usage")
    public R<Void> submitUsage(@RequestBody VehicleUsage usage) {
        return usageService.submitUsage(usage);
    }

    /** 用车记录详情 */
    @GetMapping("/usage/{id}")
    public R<VehicleUsage> getUsageInfo(@PathVariable("id") Long id) {
        return R.ok(usageService.getById(id));
    }

    /** 审批用车申请 - 仅管理员/经理 */
    @SysLog("审批用车申请")
    @PutMapping("/usage/{id}/approve")
    @SaCheckRole(value = {"admin", "manager"}, mode = SaMode.OR)
    public R<Void> approveUsage(@PathVariable("id") Long id, @RequestBody VehicleUsageApprovalDTO dto) {
        String remark = dto.getRemark() == null ? "" : dto.getRemark();
        return usageService.approveUsage(id, Boolean.TRUE.equals(dto.getApproved()), remark);
    }

    /** 归还车辆（完成用车） */
    @SysLog("归还车辆")
    @PutMapping("/usage/{id}/return")
    public R<Void> returnVehicle(@PathVariable("id") Long id, @RequestBody VehicleReturnDTO dto) {
        String remark = dto.getRemark() == null ? "" : dto.getRemark();
        return usageService.returnVehicle(id, dto.getEndMileage(), remark);
    }

    /** 取消用车申请 */
    @SysLog("取消用车申请")
    @PutMapping("/usage/{id}/cancel")
    public R<Void> cancelUsage(@PathVariable("id") Long id) {
        return usageService.cancelUsage(id);
    }

    // ==================== 费用管理 ====================

    /** 费用列表（分页） */
    @GetMapping("/expense/list")
    public R<PageResult<VehicleExpense>> listExpense(VehicleExpense expense, PageQuery pageQuery) {
        return R.ok(expenseService.queryPage(expense, pageQuery));
    }

    /** 新增费用 */
    @SysLog("新增车辆费用")
    @PostMapping("/expense")
    public R<Void> addExpense(@RequestBody VehicleExpense expense) {
        return R.result(expenseService.save(expense));
    }

    /** 费用统计 */
    @GetMapping("/expense/stats")
    public R<DynamicMapVO> getExpenseStats(@RequestParam(value = "startDate", required = false) String startDate,
                                           @RequestParam(value = "endDate", required = false) String endDate) {
        return R.ok(DynamicMapVO.from(expenseService.getExpenseStats(startDate, endDate)));
    }
}
