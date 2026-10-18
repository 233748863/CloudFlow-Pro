package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaPurchaseRfqSupplier;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaPurchaseRfqSupplierMapper extends BaseMapper<OaPurchaseRfqSupplier> {
    OaPurchaseRfqSupplier selectForUpdate(@Param("id") Long id, @Param("tenantId") Long tenantId);
}
