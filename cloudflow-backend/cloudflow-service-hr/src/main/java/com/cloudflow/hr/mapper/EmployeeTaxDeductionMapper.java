package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.EmployeeTaxDeduction;
import org.apache.ibatis.annotations.Mapper;

/**
 * 员工专项扣除Mapper接口
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Mapper
public interface EmployeeTaxDeductionMapper extends BaseMapper<EmployeeTaxDeduction> {
}
