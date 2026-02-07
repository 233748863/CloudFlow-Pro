package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.SysVehicle;
import org.apache.ibatis.annotations.Mapper;

/**
 * 车辆信息 Mapper 接口
 */
@Mapper
public interface SysVehicleMapper extends BaseMapper<SysVehicle> {
}
