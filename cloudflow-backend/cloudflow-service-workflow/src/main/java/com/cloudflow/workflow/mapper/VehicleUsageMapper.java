package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.VehicleUsage;
import org.apache.ibatis.annotations.Mapper;

/**
 * 用车申请 Mapper 接口
 */
@Mapper
public interface VehicleUsageMapper extends BaseMapper<VehicleUsage> {
}
