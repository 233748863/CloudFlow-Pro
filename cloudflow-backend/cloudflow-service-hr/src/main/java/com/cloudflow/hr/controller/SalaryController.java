package com.cloudflow.hr.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.domain.dto.*;
import com.cloudflow.hr.domain.vo.*;
import com.cloudflow.hr.service.EmployeeSalaryService;
import com.cloudflow.hr.service.SalaryAdjustmentService;
import com.cloudflow.hr.service.SalaryGradeService;
import com.cloudflow.hr.service.SalaryItemService;
import com.cloudflow.hr.service.SalaryStructureService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 薪酬管理控制器
 * 提供薪资项目、薪资结构和薪资等级管理接口
 * 
 * @author CloudFlow
 */
@Slf4j
@RestController
@RequestMapping("/salary")
@RequiredArgsConstructor
public class SalaryController {
    
    private final SalaryItemService salaryItemService;
    private final SalaryStructureService salaryStructureService;
    private final SalaryGradeService salaryGradeService;
    private final EmployeeSalaryService employeeSalaryService;
    private final SalaryAdjustmentService salaryAdjustmentService;
    
    // ==================== 薪资项目管理接口 ====================
    
    /**
     * 创建薪资项目
     * 
     * @param dto 薪资项目创建DTO
     * @return 薪资项目ID
     */
    @PostMapping("/item")
    public R<Long> createSalaryItem(@Validated @RequestBody SalaryItemCreateDTO dto) {
        log.info("接收创建薪资项目请求，itemCode: {}", dto.getItemCode());
        Long id = salaryItemService.createSalaryItem(dto);
        return R.ok(id);
    }
    
    /**
     * 更新薪资项目
     * 
     * @param id 薪资项目ID
     * @param dto 薪资项目更新DTO
     * @return 操作结果
     */
    @PutMapping("/item/{id}")
    public R<Void> updateSalaryItem(@PathVariable Long id, 
                                     @Validated @RequestBody SalaryItemUpdateDTO dto) {
        log.info("接收更新薪资项目请求，ID: {}", id);
        salaryItemService.updateSalaryItem(id, dto);
        return R.ok();
    }
    
    /**
     * 获取薪资项目详情
     * 
     * @param id 薪资项目ID
     * @return 薪资项目VO
     */
    @GetMapping("/item/{id}")
    public R<SalaryItemVO> getSalaryItem(@PathVariable Long id) {
        log.info("接收获取薪资项目详情请求，ID: {}", id);
        SalaryItemVO vo = salaryItemService.getSalaryItem(id);
        return R.ok(vo);
    }
    
    /**
     * 获取薪资项目列表
     * 
     * @return 薪资项目列表
     */
    @GetMapping("/item/list")
    public R<List<SalaryItemVO>> listSalaryItems() {
        log.info("接收获取薪资项目列表请求");
        List<SalaryItemVO> list = salaryItemService.listSalaryItems();
        return R.ok(list);
    }
    
    /**
     * 删除薪资项目
     * 
     * @param id 薪资项目ID
     * @return 操作结果
     */
    @DeleteMapping("/item/{id}")
    public R<Void> deleteSalaryItem(@PathVariable Long id) {
        log.info("接收删除薪资项目请求，ID: {}", id);
        salaryItemService.deleteSalaryItem(id);
        return R.ok();
    }
    
    // ==================== 薪资结构管理接口 ====================
    
    /**
     * 创建薪资结构
     * 
     * @param dto 薪资结构创建DTO
     * @return 薪资结构ID
     */
    @PostMapping("/structure")
    public R<Long> createSalaryStructure(@Validated @RequestBody SalaryStructureCreateDTO dto) {
        log.info("接收创建薪资结构请求，structureCode: {}", dto.getStructureCode());
        Long id = salaryStructureService.createSalaryStructure(dto);
        return R.ok(id);
    }
    
    /**
     * 更新薪资结构
     * 
     * @param id 薪资结构ID
     * @param dto 薪资结构更新DTO
     * @return 操作结果
     */
    @PutMapping("/structure/{id}")
    public R<Void> updateSalaryStructure(@PathVariable Long id, 
                                          @Validated @RequestBody SalaryStructureUpdateDTO dto) {
        log.info("接收更新薪资结构请求，ID: {}", id);
        salaryStructureService.updateSalaryStructure(id, dto);
        return R.ok();
    }
    
    /**
     * 获取薪资结构详情（包含关联的薪资项目）
     * 
     * @param id 薪资结构ID
     * @return 薪资结构详情VO
     */
    @GetMapping("/structure/{id}")
    public R<SalaryStructureDetailVO> getSalaryStructure(@PathVariable Long id) {
        log.info("接收获取薪资结构详情请求，ID: {}", id);
        SalaryStructureDetailVO vo = salaryStructureService.getSalaryStructure(id);
        return R.ok(vo);
    }
    
    /**
     * 获取薪资结构列表
     * 
     * @return 薪资结构列表
     */
    @GetMapping("/structure/list")
    public R<List<SalaryStructureVO>> listSalaryStructures() {
        log.info("接收获取薪资结构列表请求");
        List<SalaryStructureVO> list = salaryStructureService.listSalaryStructures();
        return R.ok(list);
    }
    
    /**
     * 删除薪资结构
     * 
     * @param id 薪资结构ID
     * @return 操作结果
     */
    @DeleteMapping("/structure/{id}")
    public R<Void> deleteSalaryStructure(@PathVariable Long id) {
        log.info("接收删除薪资结构请求，ID: {}", id);
        salaryStructureService.deleteSalaryStructure(id);
        return R.ok();
    }
    
    // ==================== 薪资等级管理接口 ====================
    
    /**
     * 设置薪资等级
     * 如果职级已有薪资等级，则更新；否则创建新记录
     * 
     * @param dto 薪资等级设置DTO
     * @return 操作结果
     */
    @PostMapping("/grade")
    public R<Void> setSalaryGrade(@Validated @RequestBody SalaryGradeSetDTO dto) {
        log.info("接收设置薪资等级请求，levelId: {}", dto.getLevelId());
        salaryGradeService.setSalaryGrade(dto);
        return R.ok();
    }
    
    /**
     * 获取指定职级的薪资等级
     * 
     * @param levelId 职级ID
     * @return 薪资等级VO
     */
    @GetMapping("/grade/level/{levelId}")
    public R<SalaryGradeVO> getSalaryGrade(@PathVariable Long levelId) {
        log.info("接收获取薪资等级请求，levelId: {}", levelId);
        SalaryGradeVO vo = salaryGradeService.getSalaryGrade(levelId);
        return R.ok(vo);
    }
    
    /**
     * 获取薪资等级列表
     * 
     * @return 薪资等级列表
     */
    @GetMapping("/grade/list")
    public R<List<SalaryGradeVO>> listSalaryGrades() {
        log.info("接收获取薪资等级列表请求");
        List<SalaryGradeVO> list = salaryGradeService.listSalaryGrades();
        return R.ok(list);
    }
    
    /**
     * 删除薪资等级
     * 
     * @param levelId 职级ID
     * @return 操作结果
     */
    @DeleteMapping("/grade/level/{levelId}")
    public R<Void> deleteSalaryGrade(@PathVariable Long levelId) {
        log.info("接收删除薪资等级请求，levelId: {}", levelId);
        salaryGradeService.deleteSalaryGrade(levelId);
        return R.ok();
    }
    
    // ==================== 员工薪资管理接口 ====================
    
    /**
     * 分配薪资结构给员工
     * 
     * @param dto 员工薪资分配DTO
     * @return 操作结果
     */
    @PostMapping("/employee")
    public R<Void> assignSalaryStructure(@Validated @RequestBody EmployeeSalaryAssignDTO dto) {
        log.info("接收分配薪资结构请求，employeeId: {}, structureId: {}", dto.getEmployeeId(), dto.getStructureId());
        employeeSalaryService.assignSalaryStructure(dto);
        return R.ok();
    }
    
    /**
     * 获取员工薪资详情（包含薪资项目明细）
     * 
     * @param employeeId 员工ID
     * @return 员工薪资详情VO
     */
    @GetMapping("/employee/{employeeId}")
    public R<EmployeeSalaryDetailVO> getEmployeeSalary(@PathVariable Long employeeId) {
        log.info("接收获取员工薪资详情请求，employeeId: {}", employeeId);
        EmployeeSalaryDetailVO vo = employeeSalaryService.getEmployeeSalary(employeeId);
        return R.ok(vo);
    }
    
    /**
     * 查询员工薪资列表
     * 
     * @param query 查询条件
     * @return 员工薪资列表
     */
    @GetMapping("/employee/list")
    public R<List<EmployeeSalaryVO>> listEmployeeSalaries(EmployeeSalaryQueryDTO query) {
        log.info("接收查询员工薪资列表请求");
        List<EmployeeSalaryVO> list = employeeSalaryService.listEmployeeSalaries(query);
        return R.ok(list);
    }
    
    // ==================== 调薪管理接口 ====================
    
    /**
     * 创建调薪申请
     * 
     * @param dto 调薪申请创建DTO
     * @return 调薪申请ID
     */
    @PostMapping("/adjustment")
    public R<Long> createSalaryAdjustment(@Validated @RequestBody SalaryAdjustmentCreateDTO dto) {
        log.info("接收创建调薪申请请求，employeeId: {}, adjustmentType: {}", dto.getEmployeeId(), dto.getAdjustmentType());
        Long id = salaryAdjustmentService.createSalaryAdjustment(dto);
        return R.ok(id);
    }
    
    /**
     * 提交调薪申请（启动审批流程）
     * 
     * @param id 调薪申请ID
     * @return 操作结果
     */
    @PostMapping("/adjustment/{id}/submit")
    public R<Void> submitSalaryAdjustment(@PathVariable Long id) {
        log.info("接收提交调薪申请请求，id: {}", id);
        salaryAdjustmentService.submitSalaryAdjustment(id);
        return R.ok();
    }
    
    /**
     * 审批通过后更新员工薪资
     * 
     * @param id 调薪申请ID
     * @return 操作结果
     */
    @PostMapping("/adjustment/{id}/approve")
    public R<Void> approveSalaryAdjustment(@PathVariable Long id) {
        log.info("接收调薪申请审批通过请求，id: {}", id);
        salaryAdjustmentService.approveSalaryAdjustment(id);
        return R.ok();
    }
    
    /**
     * 调薪生效
     * 
     * @param id 调薪申请ID
     * @return 操作结果
     */
    @PostMapping("/adjustment/{id}/effective")
    public R<Void> effectiveSalaryAdjustment(@PathVariable Long id) {
        log.info("接收调薪生效请求，id: {}", id);
        salaryAdjustmentService.effectiveSalaryAdjustment(id);
        return R.ok();
    }
    
    /**
     * 获取调薪申请详情
     * 
     * @param id 调薪申请ID
     * @return 调薪申请VO
     */
    @GetMapping("/adjustment/{id}")
    public R<SalaryAdjustmentVO> getSalaryAdjustment(@PathVariable Long id) {
        log.info("接收获取调薪申请详情请求，id: {}", id);
        SalaryAdjustmentVO vo = salaryAdjustmentService.getSalaryAdjustment(id);
        return R.ok(vo);
    }
    
    /**
     * 分页查询调薪申请列表
     * 
     * @param query 查询条件
     * @return 分页结果
     */
    @GetMapping("/adjustment/list")
    public R<Page<SalaryAdjustmentVO>> listSalaryAdjustments(SalaryAdjustmentQueryDTO query) {
        log.info("接收分页查询调薪申请列表请求");
        Page<SalaryAdjustmentVO> page = salaryAdjustmentService.listSalaryAdjustments(query);
        return R.ok(page);
    }
    
    /**
     * 查询员工调薪历史
     * 
     * @param employeeId 员工ID
     * @return 调薪历史列表
     */
    @GetMapping("/adjustment/history/{employeeId}")
    public R<List<SalaryAdjustmentHistoryVO>> getSalaryAdjustmentHistory(@PathVariable Long employeeId) {
        log.info("接收查询员工调薪历史请求，employeeId: {}", employeeId);
        List<SalaryAdjustmentHistoryVO> list = salaryAdjustmentService.getSalaryAdjustmentHistory(employeeId);
        return R.ok(list);
    }
}
