package com.cloudflow.hr.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.domain.dto.EmployeeContractCreateDTO;
import com.cloudflow.hr.domain.dto.EmployeeContractUpdateDTO;
import com.cloudflow.hr.domain.dto.EmployeeCreateDTO;
import com.cloudflow.hr.domain.dto.EmployeeDocumentCreateDTO;
import com.cloudflow.hr.domain.dto.EmployeeDocumentUpdateDTO;
import com.cloudflow.hr.domain.dto.EmployeeQueryDTO;
import com.cloudflow.hr.domain.dto.EmployeeUpdateDTO;
import com.cloudflow.hr.domain.dto.EmergencyContactCreateDTO;
import com.cloudflow.hr.domain.dto.EmergencyContactUpdateDTO;
import com.cloudflow.hr.domain.vo.EmployeeContractVO;
import com.cloudflow.hr.domain.vo.EmployeeDocumentVO;
import com.cloudflow.hr.domain.vo.EmployeeVO;
import com.cloudflow.hr.domain.vo.EmergencyContactVO;
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
@RequestMapping("/employee")
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
     * 查询当前登录员工详情
     */
    @GetMapping("/current")
    @Operation(summary = "查询当前登录员工档案")
    public R<EmployeeVO> getCurrentEmployee() {
        log.info("接收查询当前登录员工档案请求");
        EmployeeVO vo = employeeService.getCurrentEmployee();
        return R.ok(vo);
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
    
    // ==================== 合同管理接口 ====================
    
    /**
     * 添加员工合同
     */
    @PostMapping("/contract")
    @Operation(summary = "添加员工合同")
    public R<Long> addContract(@Valid @RequestBody EmployeeContractCreateDTO dto) {
        log.info("接收添加员工合同请求，员工ID：{}，合同编号：{}", dto.getEmployeeId(), dto.getContractNo());
        Long id = employeeService.addContract(dto);
        return R.ok(id);
    }
    
    /**
     * 更新员工合同
     */
    @PutMapping("/contract/{id}")
    @Operation(summary = "更新员工合同")
    public R<Void> updateContract(@PathVariable Long id, @Valid @RequestBody EmployeeContractUpdateDTO dto) {
        log.info("接收更新员工合同请求，合同ID：{}", id);
        employeeService.updateContract(id, dto);
        return R.ok();
    }
    
    /**
     * 查询员工的所有合同
     */
    @GetMapping("/{employeeId}/contracts")
    @Operation(summary = "查询员工的所有合同")
    public R<List<EmployeeContractVO>> listContracts(@PathVariable Long employeeId) {
        log.info("接收查询员工合同列表请求，员工ID：{}", employeeId);
        List<EmployeeContractVO> list = employeeService.listContracts(employeeId);
        return R.ok(list);
    }
    
    /**
     * 查询即将到期的合同
     */
    @GetMapping("/contract/expiring")
    @Operation(summary = "查询即将到期的合同")
    public R<List<EmployeeContractVO>> listExpiringContracts(@RequestParam(defaultValue = "30") Integer days) {
        log.info("接收查询即将到期合同请求，天数：{}", days);
        List<EmployeeContractVO> list = employeeService.listExpiringContracts(days);
        return R.ok(list);
    }
    
    /**
     * 查询合同详情
     */
    @GetMapping("/contract/{id}")
    @Operation(summary = "查询合同详情")
    public R<EmployeeContractVO> getContract(@PathVariable Long id) {
        log.info("接收查询合同详情请求，合同ID：{}", id);
        EmployeeContractVO vo = employeeService.getContract(id);
        return R.ok(vo);
    }
    
    /**
     * 删除员工合同
     */
    @DeleteMapping("/contract/{id}")
    @Operation(summary = "删除员工合同")
    public R<Void> deleteContract(@PathVariable Long id) {
        log.info("接收删除员工合同请求，合同ID：{}", id);
        employeeService.deleteContract(id);
        return R.ok();
    }
    
    // ==================== 证件管理接口 ====================
    
    /**
     * 添加员工证件
     */
    @PostMapping("/document")
    @Operation(summary = "添加员工证件")
    public R<Long> addDocument(@Valid @RequestBody EmployeeDocumentCreateDTO dto) {
        log.info("接收添加员工证件请求，员工ID：{}，证件类型：{}", dto.getEmployeeId(), dto.getDocumentType());
        Long id = employeeService.addDocument(dto);
        return R.ok(id);
    }
    
    /**
     * 更新员工证件
     */
    @PutMapping("/document/{id}")
    @Operation(summary = "更新员工证件")
    public R<Void> updateDocument(@PathVariable Long id, @Valid @RequestBody EmployeeDocumentUpdateDTO dto) {
        log.info("接收更新员工证件请求，证件ID：{}", id);
        employeeService.updateDocument(id, dto);
        return R.ok();
    }
    
    /**
     * 查询员工的所有证件
     */
    @GetMapping("/{employeeId}/documents")
    @Operation(summary = "查询员工的所有证件")
    public R<List<EmployeeDocumentVO>> listDocuments(@PathVariable Long employeeId) {
        log.info("接收查询员工证件列表请求，员工ID：{}", employeeId);
        List<EmployeeDocumentVO> list = employeeService.listDocuments(employeeId);
        return R.ok(list);
    }
    
    /**
     * 查询证件详情
     */
    @GetMapping("/document/{id}")
    @Operation(summary = "查询证件详情")
    public R<EmployeeDocumentVO> getDocument(@PathVariable Long id) {
        log.info("接收查询证件详情请求，证件ID：{}", id);
        EmployeeDocumentVO vo = employeeService.getDocument(id);
        return R.ok(vo);
    }
    
    /**
     * 删除员工证件
     */
    @DeleteMapping("/document/{id}")
    @Operation(summary = "删除员工证件")
    public R<Void> deleteDocument(@PathVariable Long id) {
        log.info("接收删除员工证件请求，证件ID：{}", id);
        employeeService.deleteDocument(id);
        return R.ok();
    }
    
    // ==================== 紧急联系人管理接口 ====================
    
    /**
     * 添加紧急联系人
     */
    @PostMapping("/emergency-contact")
    @Operation(summary = "添加紧急联系人")
    public R<Long> addEmergencyContact(@Valid @RequestBody EmergencyContactCreateDTO dto) {
        log.info("接收添加紧急联系人请求，员工ID：{}，联系人姓名：{}", dto.getEmployeeId(), dto.getContactName());
        Long id = employeeService.addEmergencyContact(dto);
        return R.ok(id);
    }
    
    /**
     * 更新紧急联系人
     */
    @PutMapping("/emergency-contact/{id}")
    @Operation(summary = "更新紧急联系人")
    public R<Void> updateEmergencyContact(@PathVariable Long id, @Valid @RequestBody EmergencyContactUpdateDTO dto) {
        log.info("接收更新紧急联系人请求，联系人ID：{}", id);
        employeeService.updateEmergencyContact(id, dto);
        return R.ok();
    }
    
    /**
     * 查询员工的所有紧急联系人
     */
    @GetMapping("/{employeeId}/emergency-contacts")
    @Operation(summary = "查询员工的所有紧急联系人")
    public R<List<EmergencyContactVO>> listEmergencyContacts(@PathVariable Long employeeId) {
        log.info("接收查询员工紧急联系人列表请求，员工ID：{}", employeeId);
        List<EmergencyContactVO> list = employeeService.listEmergencyContacts(employeeId);
        return R.ok(list);
    }
    
    /**
     * 查询紧急联系人详情
     */
    @GetMapping("/emergency-contact/{id}")
    @Operation(summary = "查询紧急联系人详情")
    public R<EmergencyContactVO> getEmergencyContact(@PathVariable Long id) {
        log.info("接收查询紧急联系人详情请求，联系人ID：{}", id);
        EmergencyContactVO vo = employeeService.getEmergencyContact(id);
        return R.ok(vo);
    }
    
    /**
     * 删除紧急联系人
     */
    @DeleteMapping("/emergency-contact/{id}")
    @Operation(summary = "删除紧急联系人")
    public R<Void> deleteEmergencyContact(@PathVariable Long id) {
        log.info("接收删除紧急联系人请求，联系人ID：{}", id);
        employeeService.deleteEmergencyContact(id);
        return R.ok();
    }
}
