package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaAssetRepair;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaAssetRepairMapper extends BaseMapper<OaAssetRepair> {
    OaAssetRepair selectForUpdate(@Param("id") Long id, @Param("tenantId") Long tenantId);
}
