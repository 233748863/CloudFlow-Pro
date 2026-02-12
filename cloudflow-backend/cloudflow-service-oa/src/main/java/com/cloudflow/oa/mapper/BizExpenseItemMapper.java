package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.BizExpenseItem;
import org.apache.ibatis.annotations.Mapper;

/**
 * 报销明细Mapper接口
 */
@Mapper
public interface BizExpenseItemMapper extends BaseMapper<BizExpenseItem> {
}
