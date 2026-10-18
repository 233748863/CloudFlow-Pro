package com.cloudflow.crm.service.receivable;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.core.BusinessEventEnvelopeCodec;
import com.cloudflow.common.event.invoice.InvoiceReceiptSource;
import com.cloudflow.common.event.outbox.OutboxEvent;
import com.cloudflow.common.event.outbox.OutboxEventMapper;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmInvoiceReceiptMapper;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import com.cloudflow.crm.mapper.CrmReceiptMapper;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.cloudflow.crm.service.deal.CrmDealLedgerService;
import com.cloudflow.crm.service.deal.CrmDealPolicy;
import com.cloudflow.crm.service.impl.CrmAuditTrail;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import com.cloudflow.crm.service.opportunity.CrmSalesAmounts;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CrmInvoiceReceiptService {
    private final OutboxEventMapper outbox;
    private final ObjectMapper json;
    private final CrmInvoiceReceiptMapper invoices;
    private final CrmReceivableAccessService access;
    private final CrmReceivableMapper receivables;
    private final CrmDealLedgerService ledger;
    private final ICrmCustomerService customers;
    private final CrmAuditTrail audit;
    private final CrmReceiptMapper receiptSources;

    @Audit(name = "按真实发票来源同步回款", highRisk = true)
    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public boolean synchronize(Long receivableId, String eventId) {
        BusinessEventEnvelope persisted = persisted(eventId);
        apply(receivableId, persisted);
        return true;
    }

    @Audit(name = "消费真实发票逐笔收款", highRisk = true)
    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public void consume(BusinessEventEnvelope envelope) {
        if (envelope == null) throw invalid("发票事件不能为空");
        BusinessEventEnvelope persisted = persisted(envelope.getEventId());
        if (!json.valueToTree(persisted).equals(json.valueToTree(envelope))) throw invalid("发票事件与持久来源不一致");
        InvoiceReceiptSource source = source(persisted);
        apply(source.getReceivableId(), persisted);
    }

    private void apply(Long receivableId, BusinessEventEnvelope envelope) {
        InvoiceReceiptSource source = source(envelope);
        if (!Objects.equals(source.getReceivableId(), receivableId)) throw invalid("发票来源与回款计划不一致");
        CrmReceivable record = access.lockInternal(receivableId);
        CrmReceivableAmounts.active(record); CrmReceivableAmounts.version(record, record.getVersion());
        CrmInvoiceReceiptMapper.Invoice invoice = invoices.readInvoice(source.getInvoiceId(), record.getTenantId());
        if (invoice == null || !Objects.equals(invoice.getReceivableId(), receivableId)
                || !Objects.equals(record.getCustomerId(), source.getCustomerId()) || !Objects.equals(record.getContractId(), source.getContractId())
                || !Objects.equals(invoice.getCustomerId(), record.getCustomerId()) || !Objects.equals(invoice.getContractId(), record.getContractId())
                || record.getInvoiceId() != null && !Objects.equals(record.getInvoiceId(), invoice.getInvoiceId())
                || invoice.getVersion() < source.getInvoiceVersion() || record.getVersion() < source.getReceivableVersion()
                || invoice.getGrossAmount().compareTo(source.getGrossAmount()) != 0)
            throw invalid("发票来源、版本或真实绑定无法核实");
        BigDecimal previousAmount = CrmReceivableAmounts.received(record);
        BigDecimal received = previousAmount;
        if ("RECEIPT".equals(source.getOperation())) {
            verifyWriteoff(source);
            String currency = CrmDealPolicy.currency(record.getContractId() == null ? "CNY"
                    : receiptSources.lockCurrency(record.getContractId(), record.getTenantId()));
            if (!Objects.equals(currency, source.getCurrency())) throw invalid("发票收款币种与原回款合同不一致");
            String key = InvoiceReceiptSource.receiptKey(source.getInvoiceId(), source.getWriteoffId());
            boolean alreadyRecorded = ledger.find(key) != null;
            List<CrmDealPolicy.Member> members = source.getMembers().stream().map(member -> new CrmDealPolicy.Member(member.userId(), member.employeeId(), member.name(),
                    member.deptId(), member.role(), member.percentage(), member.commissionRate())).toList();
            LocalDateTime occurred = source.getReceiptDate().equals(source.getOccurredTime().toLocalDate())
                    ? source.getOccurredTime() : source.getReceiptDate().atStartOfDay();
            ledger.append(new CrmDealLedgerService.Fact(key, "RECEIPT", "RECEIVABLE", receivableId, record.getCustomerId(),
                    source.getReceiptAmount(), source.getCurrency(), occurred, source.getTeamVersion(), "cloudflow-service-crm",
                    source.getInvoiceVersion(), json.valueToTree(source), false), members);
            if (!alreadyRecorded) {
                received = received.add(source.getReceiptAmount());
                CrmReceivableAmounts.apply(record, received, source.getReceiptDate());
                audit.record("CRM_INVOICE_RECEIPT", "CRM_RECEIVABLE:" + receivableId,
                        "发票=" + invoice.getInvoiceId() + ",核销=" + source.getWriteoffId() + ",本次到账=" + source.getReceiptAmount().toPlainString(), true);
            }
        }
        String status = "VOID".equals(invoice.getStatus()) ? "VOID" : received.signum() == 0 ? "BOUND"
                : received.compareTo(invoice.getGrossAmount()) >= 0 ? "WRITEOFF_FULL" : "WRITEOFF_PARTIAL";
        if (received.compareTo(previousAmount) == 0 && Objects.equals(record.getInvoiceId(), invoice.getInvoiceId())
                && Objects.equals(record.getInvoiceStatus(), status)) return;
        record.setInvoiceId(invoice.getInvoiceId()); record.setInvoiceStatus(status);
        CrmRecordSupport.touch(record);
        CrmRecordSupport.saved(receivables.writeSettlement(record, record.getVersion()));
        customers.refreshHealth(record.getCustomerId());
    }

    private BusinessEventEnvelope persisted(String eventId) {
        if (eventId == null || !eventId.matches("[0-9a-f-]{36}")) throw invalid("发票同步必须提供真实持久来源编号");
        OutboxEvent stored = outbox.selectOne(new LambdaQueryWrapper<OutboxEvent>().eq(OutboxEvent::getEventId, eventId)
                .eq(OutboxEvent::getTenantId, CrmRecordSupport.tenantId()));
        if (stored == null || !InvoiceReceiptSource.EVENT.equals(stored.getEventType())
                || !InvoiceReceiptSource.SERVICE.equals(stored.getAggregateType())) throw invalid("发票持久来源不存在或不可访问");
        try {
            BusinessEventEnvelope envelope = BusinessEventEnvelopeCodec.read(stored.getPayloadJson(), json);
            if (envelope == null || !Objects.equals(eventId, envelope.getEventId()) || !Objects.equals(stored.getAggregateId(), envelope.getSourceId())
                    || !Objects.equals(stored.getTenantId(), envelope.getTenantId()) || !InvoiceReceiptSource.EVENT.equals(envelope.getEventType())
                    || !InvoiceReceiptSource.SERVICE.equals(envelope.getSourceModule()) || envelope.getPayload() == null
                    || !Objects.equals(InvoiceReceiptSource.digest(envelope.getPayload()), envelope.getPayloadDigest()))
                throw invalid("发票来源摘要无法核验");
            return envelope;
        } catch (com.fasterxml.jackson.core.JsonProcessingException failure) { throw invalid("发票持久来源格式无效"); }
    }

    private InvoiceReceiptSource source(BusinessEventEnvelope envelope) {
        InvoiceReceiptSource source;
        try { source = json.readValue(envelope.getPayload(), InvoiceReceiptSource.class); }
        catch (com.fasterxml.jackson.core.JsonProcessingException failure) { throw invalid("发票来源载荷无效"); }
        if (source == null || !Integer.valueOf(1).equals(source.getSchemaVersion()) || !Objects.equals(source.getTenantId(), CrmRecordSupport.tenantId())
                || source.getInvoiceId() == null || source.getInvoiceId() <= 0 || source.getReceivableId() == null || source.getReceivableId() <= 0
                || source.getCustomerId() == null || source.getCustomerId() <= 0 || source.getContractId() != null && source.getContractId() <= 0
                || !Objects.equals(source.getInvoiceId(), envelope.getSourceId()) || !Objects.equals(source.eventId(), envelope.getEventId())
                || source.getInvoiceVersion() == null || source.getInvoiceVersion() <= 0 || source.getReceivableVersion() == null || source.getReceivableVersion() < 0
                || source.getTeamVersion() == null || source.getTeamVersion() < 0
                || !Set.of("BOUND", "RECEIPT", "VOID").contains(source.getOperation() == null ? "" : source.getOperation())
                || source.getOccurredTime() == null || !Objects.equals(source.getOccurredTime(), envelope.getOccurredAt())
                || source.getOccurredTime().isAfter(java.time.LocalDateTime.now().plusSeconds(5))) throw invalid("发票来源身份、操作或版本无效");
        BigDecimal before = CrmDealPolicy.money(source.getReceivedBefore());
        BigDecimal after = CrmDealPolicy.money(source.getReceivedAfter());
        BigDecimal amount = CrmDealPolicy.money(source.getReceiptAmount());
        BigDecimal gross = CrmSalesAmounts.decimal(source.getGrossAmount(), 16, 2, "发票金额");
        CrmDealPolicy.currency(source.getCurrency());
        if (before.add(amount).compareTo(after) != 0 || after.compareTo(gross) > 0) throw invalid("发票来源金额不一致");
        if ("RECEIPT".equals(source.getOperation())) {
            if (amount.signum() <= 0 || source.getWriteoffId() == null || source.getWriteoffId() <= 0
                    || source.getReceiptDate() == null || source.getReceiptDate().isAfter(LocalDate.now())
                    || source.getMembers() == null || source.getMembers().isEmpty()
                    || source.getMembers().stream().anyMatch(Objects::isNull)) throw invalid("实际收款缺少金额、日期或冻结团队");
        } else if (amount.signum() != 0 || source.getWriteoffId() != null || source.getMembers() == null || !source.getMembers().isEmpty())
            throw invalid("绑定或作废不得伪造新收款");
        return source;
    }

    private void verifyWriteoff(InvoiceReceiptSource source) {
        CrmInvoiceReceiptMapper.Writeoff writeoff = invoices.readWriteoff(source.getWriteoffId(), source.getTenantId());
        if (writeoff == null || !Objects.equals(writeoff.getInvoiceId(), source.getInvoiceId())
                || !Objects.equals(writeoff.getBusinessId(), source.getReceivableId()) || !"CRM_RECEIVABLE".equals(writeoff.getBusinessType())
                || writeoff.getWriteoffAmount().compareTo(source.getReceiptAmount()) != 0 || !Objects.equals(writeoff.getWriteoffDate(), source.getReceiptDate()))
            throw invalid("发票收款来源与真实核销记录不一致");
    }

    private static CrmBusinessException invalid(String message) { return new CrmBusinessException(message); }
}
