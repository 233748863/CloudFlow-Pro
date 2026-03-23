package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.SalaryStructureItem;
import org.apache.ibatis.annotations.Mapper;

/**
 * 薪资结构项目关联Mapper接口
 */
@Mapper
public interface SalaryStructureItemMapper extends BaseMapper<SalaryStructureItem> {
}
