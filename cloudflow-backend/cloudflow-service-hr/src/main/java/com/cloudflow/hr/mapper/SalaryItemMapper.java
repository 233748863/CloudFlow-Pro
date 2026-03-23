package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.SalaryItem;
import org.apache.ibatis.annotations.Mapper;

/**
 * 薪资项目Mapper接口
 */
@Mapper
public interface SalaryItemMapper extends BaseMapper<SalaryItem> {
}
