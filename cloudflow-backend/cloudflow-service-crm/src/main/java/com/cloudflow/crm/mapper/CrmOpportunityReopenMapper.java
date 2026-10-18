package com.cloudflow.crm.mapper;

import com.cloudflow.common.event.outbox.OutboxEvent;
import com.cloudflow.crm.domain.CrmDealEvent;
import com.cloudflow.crm.domain.CrmOpportunityLostDetail;
import com.cloudflow.crm.domain.CrmOpportunityStageHistory;
import com.cloudflow.crm.domain.CrmReceivable;
import java.time.LocalDate;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmOpportunityReopenMapper {
    record Contract(Long contractId, Long tenantId, Long customerId, String currency, String status,
            Integer version, Integer deleted, Integer signedFlag, LocalDate startDate) { }
    record Quote(Long quoteId, Long customerId, Long contractId, Integer version) { }

    CrmOpportunityStageHistory latestHistory(@Param("id") Long id, @Param("tenantId") Long tenantId);
    CrmOpportunityStageHistory latestReopen(@Param("id") Long id, @Param("tenantId") Long tenantId);
    List<CrmOpportunityLostDetail> lostDetails(@Param("id") Long id, @Param("tenantId") Long tenantId);
    int clearLostDetails(@Param("id") Long id, @Param("tenantId") Long tenantId);
    List<Contract> contracts(@Param("id") Long id, @Param("tenantId") Long tenantId);
    Contract lockContract(@Param("id") Long id, @Param("tenantId") Long tenantId);
    List<Quote> quotes(@Param("id") Long id, @Param("tenantId") Long tenantId);
    List<CrmReceivable> receivables(@Param("id") Long id, @Param("tenantId") Long tenantId);
    List<OutboxEvent> contractSources(@Param("id") Long id, @Param("tenantId") Long tenantId);
    List<CrmDealEvent> events(@Param("type") String type, @Param("id") Long id, @Param("tenantId") Long tenantId);
    long pendingInvoiceReceipts(@Param("id") Long id, @Param("tenantId") Long tenantId);
}
