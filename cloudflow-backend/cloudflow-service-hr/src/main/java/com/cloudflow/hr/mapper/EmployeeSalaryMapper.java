package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.EmployeeSalary;
import org.apache.ibatis.annotations.Mapper;

/**
 * 员工薪资Mapper接口
 */
@Mapper
public interface EmployeeSalaryMapper extends BaseMapper<EmployeeSalary> {
}
