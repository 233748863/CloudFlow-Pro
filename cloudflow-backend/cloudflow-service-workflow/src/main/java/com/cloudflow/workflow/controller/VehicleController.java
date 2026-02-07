package com.cloudflow.workflow.controller;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.SysVehicle;
import com.cloudflow.workflow.domain.VehicleExpense;
import com.cloudflow.workflow.domain.VehicleUsage;
import com.cloudflow.workflow.service.IVehicleExpenseService;
import com.cloudflow.workflow.service.IVehicleService;
import com.cloudflow.workflow.service.IVehicleUsageService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

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

    // --- 车辆管理 ---

    @GetMapping("/list")
    public R<PageResult<SysVehicle>> list(SysVehicle vehicle, PageQuery pageQuery) {
        return R.ok(vehicleService.queryPage(vehicle, pageQuery));
    }

    @GetMapping("/available")
    public R<List<SysVehicle>> listAvailable() {
        return R.ok(vehicleService.listAvailable());
    }

    @GetMapping("/{id}")
    public R<SysVehicle> getInfo(@PathVariable("id") Long id) {
        return R.ok(vehicleService.getById(id));
    }

    @PostMapping
    public R<Void> add(@RequestBody SysVehicle vehicle) {
        return R.result(vehicleService.save(vehicle));
    }

    @PutMapping
    public R<Void> edit(@RequestBody SysVehicle vehicle) {
        return R.result(vehicleService.updateById(vehicle));
    }

    @DeleteMapping("/{ids}")
    public R<Void> remove(@PathVariable List<Long> ids) {
        return R.result(vehicleService.removeBatchByIds(ids));
    }

    // --- 用车申请 ---

    @GetMapping("/usage/list")
    public R<PageResult<VehicleUsage>> listUsage(VehicleUsage usage, PageQuery pageQuery) {
        return R.ok(usageService.queryPage(usage, pageQuery));
    }

    @PostMapping("/usage")
    public R<Void> submitUsage(@RequestBody VehicleUsage usage) {
        return usageService.submitUsage(usage);
    }
    
    @GetMapping("/usage/{id}")
    public R<VehicleUsage> getUsageInfo(@PathVariable("id") Long id) {
        return R.ok(usageService.getById(id));
    }

    // --- 费用管理 ---

    @GetMapping("/expense/list")
    public R<PageResult<VehicleExpense>> listExpense(VehicleExpense expense, PageQuery pageQuery) {
        return R.ok(expenseService.queryPage(expense, pageQuery));
    }

    @PostMapping("/expense")
    public R<Void> addExpense(@RequestBody VehicleExpense expense) {
        return R.result(expenseService.save(expense));
    }

    @GetMapping("/expense/stats")
    public R<Map<String, Object>> getExpenseStats(@RequestParam(required = false) String startDate, 
                                                 @RequestParam(required = false) String endDate) {
        return R.ok(expenseService.getExpenseStats(startDate, endDate));
    }
}
