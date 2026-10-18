package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaSupplierQuotation;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaSupplierQuotationMapper extends BaseMapper<OaSupplierQuotation> {
    OaSupplierQuotation selectForUpdate(@Param("id") Long id, @Param("tenantId") Long tenantId);
}
