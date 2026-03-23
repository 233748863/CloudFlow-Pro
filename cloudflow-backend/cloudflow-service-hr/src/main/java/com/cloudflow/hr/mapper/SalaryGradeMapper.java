package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.SalaryGrade;
import org.apache.ibatis.annotations.Mapper;

/**
 * 薪资等级Mapper接口
 */
@Mapper
public interface SalaryGradeMapper extends BaseMapper<SalaryGrade> {
}
