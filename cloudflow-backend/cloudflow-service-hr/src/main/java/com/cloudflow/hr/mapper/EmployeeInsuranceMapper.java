package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.EmployeeInsurance;
import org.apache.ibatis.annotations.Mapper;

/**
 * 员工五险一金Mapper接口
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Mapper
public interface EmployeeInsuranceMapper extends BaseMapper<EmployeeInsurance> {
}
