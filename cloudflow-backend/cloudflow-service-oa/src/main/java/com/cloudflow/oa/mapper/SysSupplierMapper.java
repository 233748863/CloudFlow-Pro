package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.SysSupplier;
import org.apache.ibatis.annotations.Mapper;

/**
 * 供应商 Mapper。
 */
@Mapper
public interface SysSupplierMapper extends BaseMapper<SysSupplier> {
    SysSupplier selectForUpdate(@org.apache.ibatis.annotations.Param("id") Long id, @org.apache.ibatis.annotations.Param("tenantId") Long tenantId);
    long countReferences(@org.apache.ibatis.annotations.Param("id") Long id, @org.apache.ibatis.annotations.Param("tenantId") Long tenantId);
}
