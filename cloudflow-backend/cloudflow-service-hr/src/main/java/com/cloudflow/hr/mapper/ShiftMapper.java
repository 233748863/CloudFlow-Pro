package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.Shift;
import org.apache.ibatis.annotations.Mapper;

/**
 * 班次Mapper接口
 */
@Mapper
public interface ShiftMapper extends BaseMapper<Shift> {
}
