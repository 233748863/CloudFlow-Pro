package com.cloudflow.crm.service.opportunity;

import com.cloudflow.common.event.contract.ContractPerformanceSource;
import com.cloudflow.common.event.contract.ContractPerformanceSourceCodec;
import com.cloudflow.common.event.contract.ContractPerformanceSourceCodec.Decoded;
import com.cloudflow.common.event.outbox.OutboxEvent;
import com.cloudflow.crm.domain.CrmDealEvent;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmOpportunityReopenMapper;
import com.cloudflow.crm.mapper.CrmReceiptMapper;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CrmOpportunityReopenFinanceService {
    private final CrmOpportunityReopenMapper sources;
    private final CrmReceiptMapper receipts;
    private final CrmOpportunityReopenLedgerService proof;
    private final ObjectMapper json;

    public record Check(List<String> blockers, ObjectNode evidence, int retainedContracts) { }

    @Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
    public Check inspect(CrmOpportunity opportunity) {
        Long tenantId = CrmRecordSupport.tenantId();
        List<String> blockers = new ArrayList<>();
        ObjectNode evidence = json.createObjectNode();
        ArrayNode contractProofs = evidence.putArray("contracts");
        List<CrmOpportunityReopenMapper.Contract> contracts = sources.contracts(opportunity.getOpportunityId(), tenantId);
        Set<Long> ids = new HashSet<>();
        for (CrmOpportunityReopenMapper.Contract candidate : contracts) {
            CrmOpportunityReopenMapper.Contract contract = CrmRecordSupport.require(sources.lockContract(candidate.contractId(), tenantId), "关联合同已改变，请重新核对");
            ids.add(contract.contractId());
            ObjectNode record = contractProofs.addObject().put("contractId", contract.contractId()).put("version", contract.version());
            try {
                if (!Objects.equals(contract.customerId(), opportunity.getCustomerId()) || !Objects.equals(contract.tenantId(), tenantId))
                    throw invalid("关联合同的客户或租户不一致，请先核对");
                contract(contract, record);
                ArrayNode plans = record.putArray("receivables");
                for (CrmReceivable plan : sources.receivables(contract.contractId(), tenantId)) {
                    if (!Objects.equals(plan.getCustomerId(), opportunity.getCustomerId())) throw invalid("关联回款计划的客户不一致，请先核对");
                    if (plan.getReceivedAmount() != null && plan.getReceivedAmount().signum() != 0)
                        throw invalid("回款计划#" + plan.getReceivableId() + "仍有已确认到账，请先处理原收款退款");
                    if (sources.pendingInvoiceReceipts(plan.getReceivableId(), tenantId) != 0)
                        throw invalid("回款计划#" + plan.getReceivableId() + "有尚未同步或来源待核对的发票收款");
                    if (receipts.pendingRefund(plan.getReceivableId(), tenantId) != null)
                        throw invalid("回款计划#" + plan.getReceivableId() + "存在待审批退款，请先完成审批及冲减");
                    List<CrmDealEvent> events = sources.events("RECEIVABLE", plan.getReceivableId(), tenantId);
                    if (!validBusiness(events, "RECEIPT", plan.getCustomerId(), contract.currency()) || !proof.settled(events))
                        throw invalid("回款计划#" + plan.getReceivableId() + "的原收款及成员分配尚未完整冲减");
                    ObjectNode planProof = plans.addObject().put("receivableId", plan.getReceivableId()).put("version", plan.getVersion());
                    planProof.set("settledEventIds", json.valueToTree(events.stream().map(CrmDealEvent::getEventId).toList()));
                }
            } catch (IllegalArgumentException failure) { blockers.add(failure.getMessage()); }
        }
        List<CrmOpportunityReopenMapper.Quote> quotes = sources.quotes(opportunity.getOpportunityId(), tenantId);
        for (CrmOpportunityReopenMapper.Quote quote : quotes) {
            if (!Objects.equals(quote.customerId(), opportunity.getCustomerId()) || quote.contractId() != null && !ids.contains(quote.contractId()))
                blockers.add("报价#" + quote.quoteId() + "的客户或合同关联无法核验");
        }
        evidence.set("quotes", json.valueToTree(quotes));
        return new Check(blockers.stream().distinct().toList(), evidence, contracts.size());
    }

    private void contract(CrmOpportunityReopenMapper.Contract contract, ObjectNode record) {
        List<CrmDealEvent> events = sources.events("CONTRACT", contract.contractId(), contract.tenantId());
        List<Decoded> chain = new ArrayList<>();
        Decoded previous = null;
        for (OutboxEvent stored : sources.contractSources(contract.contractId(), contract.tenantId())) {
            Decoded decoded = ContractPerformanceSourceCodec.decode(stored, contract.tenantId(), json);
            ContractPerformanceSource source = decoded.source();
            if (!Objects.equals(source.getContractId(), contract.contractId()) || !Objects.equals(source.getCustomerId(), contract.customerId())
                    || !Objects.equals(source.getCurrency(), contract.currency()) || !Objects.equals(source.getStartDate(), contract.startDate())
                    || contract.version() == null || source.getContractVersion() > contract.version()) throw invalid("关联合同的持久来源与当前业务不一致");
            if (previous == null && source.getRevision() != 1) throw invalid("关联合同缺少首笔业绩来源");
            if (previous != null) ContractPerformanceSourceCodec.transition(previous, decoded, json);
            chain.add(decoded); previous = decoded;
        }
        if (previous != null && !"REVERSE".equals(previous.source().getOperation()))
            throw invalid("合同#" + contract.contractId() + "已有业绩确认来源（含待同步），请先处理合同冲正");
        if (previous == null && Integer.valueOf(1).equals(contract.signedFlag()) && contract.startDate() != null
                && !contract.startDate().isAfter(LocalDate.now()) && !Set.of("CANCELLED", "TERMINATED").contains(safe(contract.status())))
            throw invalid("合同#" + contract.contractId() + "已签署且到达开始日期，请先核对合同业绩及冲正");
        if (previous != null && !Set.of("CANCELLED", "TERMINATED").contains(safe(contract.status())))
            throw invalid("关联合同的终止状态与冲正来源不一致");
        if (!validBusiness(events, "CONTRACT", contract.customerId(), contract.currency()) || !proof.settled(events))
            throw invalid("合同#" + contract.contractId() + "的历史业绩及原成员分配尚未完整冲正");
        Decoded prior = null;
        for (Decoded decoded : chain) {
            ContractPerformanceSource source = decoded.source();
            if (prior != null) verifyFact(events, decoded, source.reversalKey(), prior.source().getAmount().negate());
            if (!"REVERSE".equals(source.getOperation())) verifyFact(events, decoded, source.factKey(), source.getAmount());
            prior = decoded;
        }
        record.set("sourceEventIds", json.valueToTree(chain.stream().map(entry -> entry.envelope().getEventId()).toList()));
        record.set("settledEventIds", json.valueToTree(events.stream().map(CrmDealEvent::getEventId).toList()));
    }

    private void verifyFact(List<CrmDealEvent> events, Decoded decoded, String key, BigDecimal amount) {
        CrmDealEvent event = events.stream().filter(entry -> key.equals(entry.getEventKey())).findFirst()
                .orElseThrow(() -> invalid("合同冲正尚未完成同步，请先核对持久来源"));
        JsonNode snapshot = proof.parse(event.getSourceSnapshot());
        JsonNode evidence = snapshot.path("evidence");
        if (event.getAmount().compareTo(amount) != 0 || !Objects.equals(event.getTeamVersion(), decoded.source().getTeamVersion())
                || !Objects.equals(event.getOccurredTime(), decoded.source().getOccurredTime()) || !Integer.valueOf(0).equals(event.getBaselineFlag())
                || !decoded.envelope().getEventId().equals(evidence.path("sourceEventId").asText())
                || !decoded.envelope().getPayloadDigest().equals(evidence.path("sourceDigest").asText())
                || !sameContract(decoded.source(), evidence.path("contract"))) throw invalid("合同冲正凭据与原冻结事实不一致");
    }

    private boolean sameContract(ContractPerformanceSource source, JsonNode stored) {
        JsonNode expected = json.valueToTree(source);
        return expected.equals((expectedValue, storedValue) -> expectedValue.isNumber() && storedValue.isNumber()
                ? expectedValue.decimalValue().compareTo(storedValue.decimalValue()) : expectedValue.equals(storedValue) ? 0 : 1, stored);
    }

    private boolean validBusiness(List<CrmDealEvent> events, String type, Long customerId, String currency) {
        return events.stream().allMatch(event -> type.equals(event.getEventType()) && Objects.equals(event.getCustomerId(), customerId)
                && Objects.equals(event.getCurrency(), currency));
    }

    private static String safe(String value) { return value == null ? "" : value; }
    private static CrmBusinessException invalid(String message) { return new CrmBusinessException(message); }
}
