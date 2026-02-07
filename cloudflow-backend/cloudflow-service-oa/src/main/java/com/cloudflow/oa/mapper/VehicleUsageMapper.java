package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.VehicleUsage;
import org.apache.ibatis.annotations.Mapper;

/**
 * 用车申请 Mapper 接口
 */
@Mapper
public interface VehicleUsageMapper extends BaseMapper<VehicleUsage> {
}
