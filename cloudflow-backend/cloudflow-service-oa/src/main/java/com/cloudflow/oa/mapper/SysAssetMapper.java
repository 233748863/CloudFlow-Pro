package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.SysAsset;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface SysAssetMapper extends BaseMapper<SysAsset> {
    SysAsset selectForUpdate(@org.apache.ibatis.annotations.Param("id") Long id, @org.apache.ibatis.annotations.Param("tenantId") Long tenantId);
}
