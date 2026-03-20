package com.cloudflow.hr.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.domain.dto.EmployeeCreateDTO;
import com.cloudflow.hr.domain.dto.EmployeeQueryDTO;
import com.cloudflow.hr.domain.dto.EmployeeUpdateDTO;
import com.cloudflow.hr.domain.vo.EmployeeVO;
import com.cloudflow.hr.service.EmployeeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 员工档案管理控制器
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@RestController
@RequestMapping("/api/hr/employee")
@RequiredArgsConstructor
@Tag(name = "员工档案管理", description = "员工档案的创建、更新、查询和删除")
public class EmployeeController {
    
    private final EmployeeService employeeService;
    
    /**
     * 创建员工档案
     */
    @PostMapping
    @Operation(summary = "创建员工档案")
    public R<Long> createEmployee(@Valid @RequestBody EmployeeCreateDTO dto) {
        log.info("接收创建员工档案请求，工号：{}", dto.getEmployeeNo());
        Long id = employeeService.createEmployee(dto);
        return R.ok(id);
    }
    
    /**
     * 更新员工档案
     */
    @PutMapping("/{id}")
    @Operation(summary = "更新员工档案")
    public R<Void> updateEmployee(@PathVariable Long id, @Valid @RequestBody EmployeeUpdateDTO dto) {
        log.info("接收更新员工档案请求，员工ID：{}", id);
        employeeService.updateEmployee(id, dto);
        return R.ok();
    }
    
    /**
     * 查询员工详情
     */
    @GetMapping("/{id}")
    @Operation(summary = "查询员工详情")
    public R<EmployeeVO> getEmployee(@PathVariable Long id) {
        log.info("接收查询员工详情请求，员工ID：{}", id);
        EmployeeVO vo = employeeService.getEmployee(id);
        return R.ok(vo);
    }
    
    /**
     * 查询员工列表
     */
    @GetMapping("/list")
    @Operation(summary = "查询员工列表")
    public R<List<EmployeeVO>> listEmployees(EmployeeQueryDTO query) {
        log.info("接收查询员工列表请求，查询条件：{}", query);
        List<EmployeeVO> list = employeeService.listEmployees(query);
        return R.ok(list);
    }
    
    /**
     * 删除员工档案
     */
    @DeleteMapping("/{id}")
    @Operation(summary = "删除员工档案")
    public R<Void> deleteEmployee(@PathVariable Long id) {
        log.info("接收删除员工档案请求，员工ID：{}", id);
        employeeService.deleteEmployee(id);
        return R.ok();
    }
}
