package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaAssetMaintenancePlan;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaAssetMaintenancePlanMapper extends BaseMapper<OaAssetMaintenancePlan> {
    OaAssetMaintenancePlan selectForUpdate(@Param("id") Long id, @Param("tenantId") Long tenantId);
}
