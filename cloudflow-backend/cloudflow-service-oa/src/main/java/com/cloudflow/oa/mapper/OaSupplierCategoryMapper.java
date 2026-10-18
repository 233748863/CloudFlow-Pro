package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaSupplierCategory;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaSupplierCategoryMapper extends BaseMapper<OaSupplierCategory> {
    OaSupplierCategory selectForUpdate(@Param("id") Long id, @Param("tenantId") Long tenantId);
}
