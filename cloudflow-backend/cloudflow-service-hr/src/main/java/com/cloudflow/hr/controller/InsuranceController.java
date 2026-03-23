package com.cloudflow.hr.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.domain.dto.EmployeeInsuranceAssignDTO;
import com.cloudflow.hr.domain.dto.EmployeeInsuranceQueryDTO;
import com.cloudflow.hr.domain.dto.InsuranceSchemeCreateDTO;
import com.cloudflow.hr.domain.dto.InsuranceSchemeUpdateDTO;
import com.cloudflow.hr.domain.vo.EmployeeInsuranceDetailVO;
import com.cloudflow.hr.domain.vo.EmployeeInsuranceVO;
import com.cloudflow.hr.domain.vo.InsuranceCalculationVO;
import com.cloudflow.hr.domain.vo.InsuranceSchemeVO;
import com.cloudflow.hr.service.EmployeeInsuranceService;
import com.cloudflow.hr.service.InsuranceSchemeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;

/**
 * 五险一金管理控制器
 * 提供五险一金方案管理和员工五险一金管理的API接口
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@RestController
@RequestMapping("/insurance")
@RequiredArgsConstructor
@Tag(name = "五险一金管理", description = "五险一金方案管理和员工五险一金管理")
public class InsuranceController {
    
    private final InsuranceSchemeService insuranceSchemeService;
    private final EmployeeInsuranceService employeeInsuranceService;
    
    // ==================== 五险一金方案管理 ====================
    
    /**
     * 创建五险一金方案
     * 
     * @param dto 创建DTO
     * @return 方案ID
     */
    @PostMapping("/scheme")
    @Operation(summary = "创建五险一金方案", description = "创建新的五险一金缴纳方案")
    public R<Long> createInsuranceScheme(@Validated @RequestBody InsuranceSchemeCreateDTO dto) {
        log.info("创建五险一金方案，方案名称：{}", dto.getSchemeName());
        Long id = insuranceSchemeService.createInsuranceScheme(dto);
        return R.ok(id);
    }
    
    /**
     * 更新五险一金方案
     * 
     * @param id 方案ID
     * @param dto 更新DTO
     * @return 操作结果
     */
    @PutMapping("/scheme/{id}")
    @Operation(summary = "更新五险一金方案", description = "更新现有的五险一金缴纳方案")
    public R<Void> updateInsuranceScheme(
            @Parameter(description = "方案ID") @PathVariable Long id,
            @Validated @RequestBody InsuranceSchemeUpdateDTO dto) {
        log.info("更新五险一金方案，方案ID：{}", id);
        insuranceSchemeService.updateInsuranceScheme(id, dto);
        return R.ok();
    }
    
    /**
     * 获取五险一金方案详情
     * 
     * @param id 方案ID
     * @return 方案详情
     */
    @GetMapping("/scheme/{id}")
    @Operation(summary = "获取五险一金方案详情", description = "根据ID获取五险一金方案的详细信息")
    public R<InsuranceSchemeVO> getInsuranceScheme(
            @Parameter(description = "方案ID") @PathVariable Long id) {
        log.info("查询五险一金方案详情，方案ID：{}", id);
        InsuranceSchemeVO vo = insuranceSchemeService.getInsuranceScheme(id);
        return R.ok(vo);
    }
    
    /**
     * 获取五险一金方案列表
     * 
     * @return 方案列表
     */
    @GetMapping("/scheme/list")
    @Operation(summary = "获取五险一金方案列表", description = "获取所有启用的五险一金方案列表")
    public R<List<InsuranceSchemeVO>> listInsuranceSchemes() {
        log.info("查询五险一金方案列表");
        List<InsuranceSchemeVO> list = insuranceSchemeService.listInsuranceSchemes();
        return R.ok(list);
    }
    
    /**
     * 根据城市获取五险一金方案列表
     * 
     * @param city 城市
     * @return 方案列表
     */
    @GetMapping("/scheme/list/city/{city}")
    @Operation(summary = "根据城市获取五险一金方案列表", description = "获取指定城市的五险一金方案列表")
    public R<List<InsuranceSchemeVO>> listInsuranceSchemesByCity(
            @Parameter(description = "城市") @PathVariable String city) {
        log.info("查询城市五险一金方案列表，城市：{}", city);
        List<InsuranceSchemeVO> list = insuranceSchemeService.listInsuranceSchemesByCity(city);
        return R.ok(list);
    }
    
    // ==================== 员工五险一金管理 ====================
    
    /**
     * 为员工分配五险一金方案
     * 
     * @param dto 分配DTO
     * @return 操作结果
     */
    @PostMapping("/employee")
    @Operation(summary = "为员工分配五险一金方案", description = "为员工分配五险一金缴纳方案和缴纳基数")
    public R<Void> assignInsuranceScheme(@Validated @RequestBody EmployeeInsuranceAssignDTO dto) {
        log.info("为员工分配五险一金方案，员工ID：{}，方案ID：{}", dto.getEmployeeId(), dto.getSchemeId());
        employeeInsuranceService.assignInsuranceScheme(dto);
        return R.ok();
    }
    
    /**
     * 获取员工五险一金详情
     * 
     * @param employeeId 员工ID
     * @return 员工五险一金详情
     */
    @GetMapping("/employee/{employeeId}")
    @Operation(summary = "获取员工五险一金详情", description = "获取员工的五险一金配置和缴纳金额详情")
    public R<EmployeeInsuranceDetailVO> getEmployeeInsurance(
            @Parameter(description = "员工ID") @PathVariable Long employeeId) {
        log.info("查询员工五险一金详情，员工ID：{}", employeeId);
        EmployeeInsuranceDetailVO vo = employeeInsuranceService.getEmployeeInsurance(employeeId);
        return R.ok(vo);
    }
    
    /**
     * 分页查询员工五险一金列表
     * 
     * @param query 查询条件
     * @return 分页结果
     */
    @GetMapping("/employee/list")
    @Operation(summary = "分页查询员工五险一金列表", description = "根据条件分页查询员工五险一金配置列表")
    public R<Page<EmployeeInsuranceVO>> listEmployeeInsurances(EmployeeInsuranceQueryDTO query) {
        log.info("分页查询员工五险一金列表，查询条件：{}", query);
        Page<EmployeeInsuranceVO> page = employeeInsuranceService.listEmployeeInsurances(query);
        return R.ok(page);
    }
    
    /**
     * 计算员工五险一金
     * 
     * @param employeeId 员工ID
     * @param salary 薪资（可选，用于计算基数）
     * @return 计算结果
     */
    @GetMapping("/employee/{employeeId}/calculate")
    @Operation(summary = "计算员工五险一金", description = "根据员工配置的方案和基数计算五险一金缴纳金额")
    public R<InsuranceCalculationVO> calculateInsurance(
            @Parameter(description = "员工ID") @PathVariable Long employeeId,
            @Parameter(description = "薪资（可选）") @RequestParam(required = false) BigDecimal salary) {
        log.info("计算员工五险一金，员工ID：{}，薪资：{}", employeeId, salary);
        InsuranceCalculationVO vo = employeeInsuranceService.calculateInsurance(employeeId, salary);
        return R.ok(vo);
    }
}
