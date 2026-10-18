package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaSupplierQuotationItem;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface OaSupplierQuotationItemMapper extends BaseMapper<OaSupplierQuotationItem> {
    OaSupplierQuotationItem selectForUpdate(@Param("id") Long id, @Param("tenantId") Long tenantId);

    List<OaSupplierQuotationItem> selectAllForQuotation(@Param("quotationId") Long quotationId, @Param("tenantId") Long tenantId);

    int restoreItem(@Param("item") OaSupplierQuotationItem item);
}
