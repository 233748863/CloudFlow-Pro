package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.LeaveType;
import org.apache.ibatis.annotations.Mapper;

/**
 * 假期类型Mapper接口
 */
@Mapper
public interface LeaveTypeMapper extends BaseMapper<LeaveType> {
}
