package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaAssetMaintenanceTask;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaAssetMaintenanceTaskMapper extends BaseMapper<OaAssetMaintenanceTask> {
    OaAssetMaintenanceTask selectForUpdate(@Param("id") Long id, @Param("tenantId") Long tenantId);
}
