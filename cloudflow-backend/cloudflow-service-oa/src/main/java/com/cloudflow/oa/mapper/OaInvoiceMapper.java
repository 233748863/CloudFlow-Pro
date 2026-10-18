package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaInvoice;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaInvoiceMapper extends BaseMapper<OaInvoice> {
    OaInvoice lockById(@Param("id") Long id, @Param("tenantId") Long tenantId);
    int removeLocked(@Param("record") OaInvoice record);
}
