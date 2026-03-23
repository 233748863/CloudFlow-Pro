package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.EmployeeSalaryAssignDTO;
import com.cloudflow.hr.domain.dto.EmployeeSalaryQueryDTO;
import com.cloudflow.hr.domain.vo.EmployeeSalaryDetailVO;
import com.cloudflow.hr.domain.vo.EmployeeSalaryVO;

import java.util.List;

/**
 * 员工薪资服务接口
 * 提供员工薪资的分配和查询功能
 */
public interface EmployeeSalaryService {
    
    /**
     * 分配薪资结构给员工
     * @param dto 员工薪资分配DTO
     */
    void assignSalaryStructure(EmployeeSalaryAssignDTO dto);
    
    /**
     * 获取员工薪资详情（包含薪资项目明细）
     * @param employeeId 员工ID
     * @return 员工薪资详情视图对象
     */
    EmployeeSalaryDetailVO getEmployeeSalary(Long employeeId);
    
    /**
     * 查询员工薪资列表
     * @param query 查询条件
     * @return 员工薪资列表
     */
    List<EmployeeSalaryVO> listEmployeeSalaries(EmployeeSalaryQueryDTO query);
}
