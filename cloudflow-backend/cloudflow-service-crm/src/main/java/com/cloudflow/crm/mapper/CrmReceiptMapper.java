package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.crm.domain.vo.CrmRefundReceiptVO;
import java.math.BigDecimal;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmReceiptMapper {
    record ContractSource(Long contractId, Long tenantId, Long customerId, String contractNo, Long ownerId, String currency) { }

    Page<CrmRefundReceiptVO> refundSources(Page<CrmRefundReceiptVO> page, @Param("id") Long id, @Param("tenantId") Long tenantId,
            @Param("receiptEventId") Long receiptEventId);
    BigDecimal netReceived(@Param("id") Long id, @Param("tenantId") Long tenantId, @Param("currency") String currency);
    Long pendingRefund(@Param("id") Long id, @Param("tenantId") Long tenantId);
    String readCurrency(@Param("id") Long id, @Param("tenantId") Long tenantId);
    String lockCurrency(@Param("id") Long id, @Param("tenantId") Long tenantId);
    ContractSource lockContractSource(@Param("id") Long id, @Param("tenantId") Long tenantId);
}
