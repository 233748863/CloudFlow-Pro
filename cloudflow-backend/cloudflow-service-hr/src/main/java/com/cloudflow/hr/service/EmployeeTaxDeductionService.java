package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.EmployeeTaxDeductionCreateDTO;
import com.cloudflow.hr.domain.dto.EmployeeTaxDeductionUpdateDTO;
import com.cloudflow.hr.domain.vo.EmployeeTaxDeductionVO;

import java.util.List;

/**
 * 员工专项扣除服务接口
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
public interface EmployeeTaxDeductionService {
    
    /**
     * 添加员工专项扣除
     * 
     * @param dto 创建DTO
     * @return 扣除ID
     */
    Long addTaxDeduction(EmployeeTaxDeductionCreateDTO dto);
    
    /**
     * 更新员工专项扣除
     * 
     * @param id 扣除ID
     * @param dto 更新DTO
     */
    void updateTaxDeduction(Long id, EmployeeTaxDeductionUpdateDTO dto);
    
    /**
     * 删除员工专项扣除
     * 
     * @param id 扣除ID
     */
    void deleteTaxDeduction(Long id);
    
    /**
     * 查询员工的所有专项扣除
     * 
     * @param employeeId 员工ID
     * @return 专项扣除列表
     */
    List<EmployeeTaxDeductionVO> listTaxDeductions(Long employeeId);
    
    /**
     * 查询员工在指定日期生效的专项扣除
     * 
     * @param employeeId 员工ID
     * @param year 年份
     * @param month 月份
     * @return 专项扣除列表
     */
    List<EmployeeTaxDeductionVO> listActiveTaxDeductions(Long employeeId, Integer year, Integer month);
}
