package com.cloudflow.hr.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.domain.dto.*;
import com.cloudflow.hr.domain.vo.EmployeeTaxDeductionVO;
import com.cloudflow.hr.domain.vo.TaxCalculationVO;
import com.cloudflow.hr.domain.vo.TaxConfigVO;
import com.cloudflow.hr.service.EmployeeTaxDeductionService;
import com.cloudflow.hr.service.TaxConfigService;
import com.cloudflow.hr.service.TaxService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 个税管理控制器
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Slf4j
@RestController
@RequestMapping("/tax")
@RequiredArgsConstructor
@Tag(name = "个税管理", description = "个税配置、专项扣除、个税计算相关接口")
public class TaxController {
    
    private final TaxConfigService taxConfigService;
    private final EmployeeTaxDeductionService taxDeductionService;
    private final TaxService taxService;
    
    // ==================== 个税配置管理 ====================
    
    /**
     * 创建个税配置
     */
    @PostMapping("/config")
    @Operation(summary = "创建个税配置", description = "创建新的个税配置，包括起征点和税率表")
    public R<Long> createTaxConfig(@Valid @RequestBody TaxConfigCreateDTO dto) {
        log.info("创建个税配置，起征点：{}", dto.getThreshold());
        Long id = taxConfigService.createTaxConfig(dto);
        return R.ok(id);
    }
    
    /**
     * 更新个税配置
     */
    @PutMapping("/config/{id}")
    @Operation(summary = "更新个税配置", description = "更新指定的个税配置")
    public R<Void> updateTaxConfig(@PathVariable Long id,
                                        @RequestBody TaxConfigUpdateDTO dto) {
        log.info("更新个税配置，ID：{}", id);
        taxConfigService.updateTaxConfig(id, dto);
        return R.ok();
    }
    
    /**
     * 获取当前生效的个税配置
     */
    @GetMapping("/config/current")
    @Operation(summary = "获取当前生效的个税配置", description = "获取当前日期生效的个税配置")
    public R<TaxConfigVO> getCurrentTaxConfig() {
        log.info("获取当前生效的个税配置");
        TaxConfigVO vo = taxConfigService.getCurrentTaxConfig();
        return R.ok(vo);
    }
    
    /**
     * 根据ID获取个税配置
     */
    @GetMapping("/config/{id}")
    @Operation(summary = "根据ID获取个税配置", description = "根据配置ID获取个税配置详情")
    public R<TaxConfigVO> getTaxConfig(@PathVariable Long id) {
        log.info("获取个税配置，ID：{}", id);
        TaxConfigVO vo = taxConfigService.getTaxConfig(id);
        return R.ok(vo);
    }
    
    // ==================== 员工专项扣除管理 ====================
    
    /**
     * 添加员工专项扣除
     */
    @PostMapping("/deduction")
    @Operation(summary = "添加员工专项扣除", description = "为员工添加专项附加扣除项目")
    public R<Long> addTaxDeduction(@Valid @RequestBody EmployeeTaxDeductionCreateDTO dto) {
        log.info("添加员工专项扣除，员工ID：{}，扣除类型：{}", dto.getEmployeeId(), dto.getDeductionType());
        Long id = taxDeductionService.addTaxDeduction(dto);
        return R.ok(id);
    }
    
    /**
     * 更新员工专项扣除
     */
    @PutMapping("/deduction/{id}")
    @Operation(summary = "更新员工专项扣除", description = "更新指定的专项扣除记录")
    public R<Void> updateTaxDeduction(@PathVariable Long id,
                                           @RequestBody EmployeeTaxDeductionUpdateDTO dto) {
        log.info("更新员工专项扣除，ID：{}", id);
        taxDeductionService.updateTaxDeduction(id, dto);
        return R.ok();
    }
    
    /**
     * 删除员工专项扣除
     */
    @DeleteMapping("/deduction/{id}")
    @Operation(summary = "删除员工专项扣除", description = "删除指定的专项扣除记录")
    public R<Void> deleteTaxDeduction(@PathVariable Long id) {
        log.info("删除员工专项扣除，ID：{}", id);
        taxDeductionService.deleteTaxDeduction(id);
        return R.ok();
    }
    
    /**
     * 查询员工的所有专项扣除
     */
    @GetMapping("/deduction/employee/{employeeId}")
    @Operation(summary = "查询员工的所有专项扣除", description = "查询指定员工的所有专项扣除记录")
    public R<List<EmployeeTaxDeductionVO>> listTaxDeductions(@PathVariable Long employeeId) {
        log.info("查询员工的所有专项扣除，员工ID：{}", employeeId);
        List<EmployeeTaxDeductionVO> list = taxDeductionService.listTaxDeductions(employeeId);
        return R.ok(list);
    }
    
    /**
     * 查询员工在指定日期生效的专项扣除
     */
    @GetMapping("/deduction/employee/{employeeId}/active")
    @Operation(summary = "查询员工在指定日期生效的专项扣除", description = "查询员工在指定年月生效的专项扣除")
    public R<List<EmployeeTaxDeductionVO>> listActiveTaxDeductions(
            @PathVariable Long employeeId,
            @RequestParam Integer year,
            @RequestParam Integer month) {
        log.info("查询员工在指定日期生效的专项扣除，员工ID：{}，年月：{}-{}", employeeId, year, month);
        List<EmployeeTaxDeductionVO> list = taxDeductionService.listActiveTaxDeductions(employeeId, year, month);
        return R.ok(list);
    }
    
    // ==================== 个税计算 ====================
    
    /**
     * 计算个人所得税
     */
    @PostMapping("/calculate")
    @Operation(summary = "计算个人所得税", description = "根据应税收入和专项扣除计算个人所得税")
    public R<TaxCalculationVO> calculateTax(@Valid @RequestBody TaxCalculationDTO dto) {
        log.info("计算个人所得税，员工ID：{}，应税收入：{}", dto.getEmployeeId(), dto.getTaxableIncome());
        TaxCalculationVO vo = taxService.calculateTax(dto);
        return R.ok(vo);
    }
}
