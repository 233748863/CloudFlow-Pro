package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.crm.domain.CrmCustomerCredit;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;

@Mapper
public interface CrmCustomerCreditMapper extends BaseMapper<CrmCustomerCredit> {
    Long lockCustomer(@Param("customerId") Long customerId);
    CrmCustomerCredit lockByCustomer(@Param("customerId") Long customerId);
    Map<String, BigDecimal> exposure(@Param("customerId") Long customerId, @Param("today") LocalDate today);
}
