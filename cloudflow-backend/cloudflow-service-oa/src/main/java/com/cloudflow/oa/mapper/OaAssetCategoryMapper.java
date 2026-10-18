package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaAssetCategory;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaAssetCategoryMapper extends BaseMapper<OaAssetCategory> {
    OaAssetCategory selectForUpdate(@Param("id") Long id, @Param("tenantId") Long tenantId);
}
