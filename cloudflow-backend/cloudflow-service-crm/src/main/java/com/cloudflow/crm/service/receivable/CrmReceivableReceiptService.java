package com.cloudflow.crm.service.receivable;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.crm.domain.CrmDealEvent;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.mapper.CrmReceiptMapper;
import com.cloudflow.crm.service.deal.CrmDealLedgerService;
import com.cloudflow.crm.service.deal.CrmDealPolicy;
import com.cloudflow.crm.service.deal.CrmDealTeamStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CrmReceivableReceiptService {
    private final CrmDealTeamStore teams;
    private final CrmDealLedgerService ledger;
    private final CrmReceiptMapper receipts;
    private final ObjectMapper json;

    @Audit(name = "冻结CRM本次实收及成员分配", highRisk = true)
    @Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
    public CrmDealEvent recordReceipt(CrmReceivable record, BigDecimal amount, LocalDate date, String operation, String remark) {
        CrmReceivableAmounts.version(record, record.getVersion());
        CrmReceivableAmounts.positive(amount, "本次到账金额");
        CrmReceivableAmounts.date(date);
        String currency = CrmDealPolicy.currency(record.getContractId() == null ? "CNY"
                : receipts.lockCurrency(record.getContractId(), record.getTenantId()));
        CrmDealTeamStore.Snapshot team = teams.lock("RECEIVABLE", record.getReceivableId(), record.getOwnerId(), null);
        int nextVersion = record.getVersion() + 1;
        ObjectNode evidence = json.createObjectNode().put("receivableId", record.getReceivableId()).put("operation", operation)
                .put("receivedBefore", CrmReceivableAmounts.received(record)).put("receivedAfter", CrmReceivableAmounts.received(record).add(amount))
                .put("receiptAmount", amount).put("receiptDate", date.toString()).put("currency", currency).put("originalVersion", record.getVersion());
        if (record.getContractId() != null) evidence.put("contractId", record.getContractId());
        if (remark != null) evidence.put("remark", remark);
        LocalDateTime occurred = date.equals(LocalDate.now()) ? LocalDateTime.now() : date.atStartOfDay();
        return ledger.append(new CrmDealLedgerService.Fact("CRM_RECEIVABLE_RECEIPT:" + record.getReceivableId() + ":" + nextVersion,
                "RECEIPT", "RECEIVABLE", record.getReceivableId(), record.getCustomerId(), amount, currency, occurred, team.version(),
                "cloudflow-service-crm", nextVersion, evidence, false), team.resolved().members());
    }
}
