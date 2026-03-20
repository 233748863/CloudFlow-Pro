package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.EmployeeCreateDTO;
import com.cloudflow.hr.domain.dto.EmployeeQueryDTO;
import com.cloudflow.hr.domain.dto.EmployeeUpdateDTO;
import com.cloudflow.hr.domain.vo.EmployeeVO;

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
}
