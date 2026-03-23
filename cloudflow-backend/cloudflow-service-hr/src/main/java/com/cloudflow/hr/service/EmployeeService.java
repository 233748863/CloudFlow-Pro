package com.cloudflow.hr.service;

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

import java.util.List;

/**
 * 员工档案服务接口
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
public interface EmployeeService {
    
    /**
     * 创建员工档案
     * 
     * @param dto 员工创建DTO
     * @return 员工ID
     */
    Long createEmployee(EmployeeCreateDTO dto);
    
    /**
     * 更新员工档案
     * 
     * @param id  员工ID
     * @param dto 员工更新DTO
     */
    void updateEmployee(Long id, EmployeeUpdateDTO dto);
    
    /**
     * 查询员工详情
     * 
     * @param id 员工ID
     * @return 员工VO
     */
    EmployeeVO getEmployee(Long id);
    
    /**
     * 查询员工列表（支持数据权限过滤）
     * 
     * @param query 查询条件
     * @return 员工列表
     */
    List<EmployeeVO> listEmployees(EmployeeQueryDTO query);
    
    /**
     * 删除员工档案
     * 
     * @param id 员工ID
     */
    void deleteEmployee(Long id);
    
    // ==================== 合同管理 ====================
    
    /**
     * 添加员工合同
     * 
     * @param dto 合同创建DTO
     * @return 合同ID
     */
    Long addContract(EmployeeContractCreateDTO dto);
    
    /**
     * 更新员工合同
     * 
     * @param id  合同ID
     * @param dto 合同更新DTO
     */
    void updateContract(Long id, EmployeeContractUpdateDTO dto);
    
    /**
     * 查询员工的所有合同
     * 
     * @param employeeId 员工ID
     * @return 合同列表
     */
    List<EmployeeContractVO> listContracts(Long employeeId);
    
    /**
     * 查询即将到期的合同
     * 
     * @param days 天数（例如30表示30天内到期）
     * @return 即将到期的合同列表
     */
    List<EmployeeContractVO> listExpiringContracts(Integer days);
    
    /**
     * 查询合同详情
     * 
     * @param id 合同ID
     * @return 合同VO
     */
    EmployeeContractVO getContract(Long id);
    
    /**
     * 删除员工合同
     * 
     * @param id 合同ID
     */
    void deleteContract(Long id);
    
    // ==================== 证件管理 ====================
    
    /**
     * 添加员工证件
     * 
     * @param dto 证件创建DTO
     * @return 证件ID
     */
    Long addDocument(EmployeeDocumentCreateDTO dto);
    
    /**
     * 更新员工证件
     * 
     * @param id  证件ID
     * @param dto 证件更新DTO
     */
    void updateDocument(Long id, EmployeeDocumentUpdateDTO dto);
    
    /**
     * 查询员工的所有证件
     * 
     * @param employeeId 员工ID
     * @return 证件列表
     */
    List<EmployeeDocumentVO> listDocuments(Long employeeId);
    
    /**
     * 查询证件详情
     * 
     * @param id 证件ID
     * @return 证件VO
     */
    EmployeeDocumentVO getDocument(Long id);
    
    /**
     * 删除员工证件
     * 
     * @param id 证件ID
     */
    void deleteDocument(Long id);
    
    // ==================== 紧急联系人管理 ====================
    
    /**
     * 添加紧急联系人
     * 
     * @param dto 紧急联系人创建DTO
     * @return 联系人ID
     */
    Long addEmergencyContact(EmergencyContactCreateDTO dto);
    
    /**
     * 更新紧急联系人
     * 
     * @param id  联系人ID
     * @param dto 紧急联系人更新DTO
     */
    void updateEmergencyContact(Long id, EmergencyContactUpdateDTO dto);
    
    /**
     * 查询员工的所有紧急联系人
     * 
     * @param employeeId 员工ID
     * @return 紧急联系人列表
     */
    List<EmergencyContactVO> listEmergencyContacts(Long employeeId);
    
    /**
     * 查询紧急联系人详情
     * 
     * @param id 联系人ID
     * @return 紧急联系人VO
     */
    EmergencyContactVO getEmergencyContact(Long id);
    
    /**
     * 删除紧急联系人
     * 
     * @param id 联系人ID
     */
    void deleteEmergencyContact(Long id);
}
