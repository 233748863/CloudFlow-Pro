package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.hr.domain.dto.EmployeeInsuranceAssignDTO;
import com.cloudflow.hr.domain.dto.EmployeeInsuranceQueryDTO;
import com.cloudflow.hr.domain.vo.EmployeeInsuranceDetailVO;
import com.cloudflow.hr.domain.vo.EmployeeInsuranceVO;
import com.cloudflow.hr.domain.vo.InsuranceCalculationVO;

import java.math.BigDecimal;

/**
 * 员工五险一金服务接口
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
public interface EmployeeInsuranceService {

    /**
     * 为员工分配五险一金方案
     * 
     * @param dto 分配DTO
     */
    void assignInsuranceScheme(EmployeeInsuranceAssignDTO dto);

    /**
     * 获取员工五险一金详情
     * 
     * @param employeeId 员工ID
     * @return 员工五险一金详情VO
     */
    EmployeeInsuranceDetailVO getEmployeeInsurance(Long employeeId);

    /**
     * 分页查询员工五险一金列表
     * 
     * @param query 查询条件
     * @return 分页结果
     */
    Page<EmployeeInsuranceVO> listEmployeeInsurances(EmployeeInsuranceQueryDTO query);

    /**
     * 计算五险一金
     * 
     * @param employeeId 员工ID
     * @param salary 薪资（用于计算基数）
     * @return 计算结果VO
     */
    InsuranceCalculationVO calculateInsurance(Long employeeId, BigDecimal salary);
}
