package com.cloudflow.oa.mapper;

import com.cloudflow.oa.domain.vo.SupplierDeliveryRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.time.LocalDate;
import java.util.List;

@Mapper
public interface OaSupplierDeliveryMapper {
    List<SupplierDeliveryRecord> selectBySupplierAndPeriod(@Param("tenantId") Long tenantId,
            @Param("supplierId") Long supplierId, @Param("from") LocalDate from, @Param("to") LocalDate to);
}
