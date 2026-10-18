package com.cloudflow.crm.service.deal;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.event.contract.ContractPerformanceSource;
import com.cloudflow.common.event.contract.ContractPerformanceSourceCodec;
import com.cloudflow.common.event.contract.ContractPerformanceSourceCodec.Decoded;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxEvent;
import com.cloudflow.common.event.outbox.OutboxEventMapper;
import com.cloudflow.crm.domain.CrmDealEvent;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmContractPerformanceMapper;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CrmContractPerformanceService {
    private final OutboxEventMapper outbox;
    private final CrmContractPerformanceMapper contracts;
    private final CrmDealLedgerService ledger;
    private final ObjectMapper json;

    @Audit(name = "按OA持久来源同步合同业绩", highRisk = true)
    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public void synchronize(String eventId) { apply(persisted(eventId)); }

    @Audit(name = "消费已生效合同业绩来源", highRisk = true)
    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public void consume(BusinessEventEnvelope envelope) {
        if (envelope == null) throw invalid("合同来源消息不能为空");
        Decoded persisted = persisted(envelope.getEventId());
        if (!json.valueToTree(persisted.envelope()).equals(json.valueToTree(envelope))) throw invalid("合同消息与持久来源不一致");
        apply(persisted);
    }

    private void apply(Decoded received) {
        CrmContractPerformanceMapper.Contract contract = contracts.lockContract(received.source().getContractId(), CrmRecordSupport.tenantId());
        if (contract == null || !Objects.equals(contract.tenantId(), received.source().getTenantId())
                || !Objects.equals(contract.customerId(), received.source().getCustomerId())
                || !Objects.equals(contract.currency(), received.source().getCurrency())
                || !Objects.equals(contract.contractType(), received.source().getContractType())
                || !Objects.equals(contract.instanceId(), received.source().getApprovalInstanceId())
                || !Objects.equals(contract.startDate(), received.source().getStartDate()) || !Objects.equals(contract.endDate(), received.source().getEndDate())
                || !Integer.valueOf(1).equals(contract.signedFlag()) || contract.ourSigneeId() == null || contract.ourSignTime() == null
                || contract.counterpartySignee() == null || contract.counterpartySignTime() == null || contract.signedFileUrl() == null
                || contract.version() == null || contract.version() < received.source().getContractVersion())
            throw invalid("合同来源与真实合同、客户、币种或版本不一致");
        if (!Objects.equals(received.source().getSignedEvidenceDigest(), ContractPerformanceSource.signatureDigest(contract.ourSigneeId(),
                contract.ourSignTime(), contract.counterpartySignee(), contract.counterpartySignTime(), contract.signedFileUrl(), json)))
            throw invalid("合同业绩来源与真实双方签署依据不一致");
        List<Decoded> chain = new ArrayList<>();
        Decoded cursor = received;
        chain.add(cursor);
        while (cursor.source().getPreviousEventId() != null) {
            Decoded previous = persisted(cursor.source().getPreviousEventId());
            try { ContractPerformanceSourceCodec.transition(previous, cursor, json); }
            catch (IllegalArgumentException failure) { throw invalid(failure.getMessage()); }
            chain.add(previous); cursor = previous;
        }
        Collections.reverse(chain);
        Decoded previous = null;
        for (Decoded entry : chain) {
            record(previous, entry);
            previous = entry;
        }
    }

    private void record(Decoded previous, Decoded decoded) {
        ContractPerformanceSource source = decoded.source();
        ObjectNode evidence = json.createObjectNode().put("sourceEventId", source.eventId()).put("sourceDigest", decoded.envelope().getPayloadDigest());
        evidence.set("contract", json.valueToTree(source));
        if (previous != null) {
            CrmDealEvent original = CrmRecordSupport.require(ledger.find(previous.source().factKey()), "合同前序原事实不存在");
            ledger.reverse(new CrmDealLedgerService.Reversal(original.getEventId(), source.reversalKey(), source.getOccurredTime(),
                    ContractPerformanceSource.SERVICE, source.getContractVersion(),
                    "REVERSE".equals(source.getOperation()) ? "合同取消或终止" : "合同金额更正", evidence));
        }
        if (!"REVERSE".equals(source.getOperation())) {
            List<CrmDealPolicy.Member> members = source.getMembers().stream().map(member -> new CrmDealPolicy.Member(member.userId(), member.employeeId(),
                    member.name(), member.deptId(), member.role(), member.percentage(), null)).toList();
            ledger.append(new CrmDealLedgerService.Fact(source.factKey(), "CONTRACT", "CONTRACT", source.getContractId(), source.getCustomerId(),
                    source.getAmount(), source.getCurrency(), source.getOccurredTime(), source.getTeamVersion(),
                    ContractPerformanceSource.SERVICE, source.getContractVersion(), evidence, false), members);
        }
    }

    private Decoded persisted(String eventId) {
        if (eventId == null || !eventId.matches("[0-9a-f-]{36}")) throw invalid("合同同步须提供真实持久来源编号");
        OutboxEvent stored = outbox.selectOne(new LambdaQueryWrapper<OutboxEvent>().eq(OutboxEvent::getTenantId, CrmRecordSupport.tenantId())
                .eq(OutboxEvent::getEventId, eventId));
        try { return ContractPerformanceSourceCodec.decode(stored, CrmRecordSupport.tenantId(), json); }
        catch (IllegalArgumentException failure) { throw invalid(failure.getMessage()); }
    }

    private static CrmBusinessException invalid(String message) { return new CrmBusinessException(message); }
}
