package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaAssetMovement;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaAssetMovementMapper extends BaseMapper<OaAssetMovement> {
    OaAssetMovement selectForUpdate(@Param("id") Long id, @Param("tenantId") Long tenantId);
}
