package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.Employee;
import org.apache.ibatis.annotations.Mapper;

/**
 * 员工档案Mapper
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Mapper
public interface EmployeeMapper extends BaseMapper<Employee> {
}
