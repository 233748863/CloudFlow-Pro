package com.cloudflow.crm.service.deal;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.crm.domain.CrmDealAllocation;
import com.cloudflow.crm.domain.CrmDealEvent;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmDealAllocationMapper;
import com.cloudflow.crm.mapper.CrmDealEventMapper;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CrmDealLedgerService {
    private final CrmDealEventMapper events;
    private final CrmDealAllocationMapper allocations;
    private final ObjectMapper json;
    private final CrmCommissionOutbox commissions;

    public record Fact(String eventKey, String eventType, String bizType, Long bizId, Long customerId,
            BigDecimal amount, String currency, LocalDateTime occurredTime, Integer teamVersion,
            String sourceService, Integer sourceVersion, JsonNode evidence, boolean baseline) { }
    public record Reversal(Long eventId, String eventKey, LocalDateTime occurredTime,
            String sourceService, Integer sourceVersion, String reason, JsonNode evidence) { }
    public record Refund(Long eventId, String eventKey, BigDecimal amount, LocalDateTime occurredTime,
            Integer sourceVersion, String reason, JsonNode evidence) { }

    @Audit(name = "登记真实业绩及成员分配")
    @Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
    public CrmDealEvent append(Fact request, List<CrmDealPolicy.Member> members) {
        CrmRecordSupport.require(request, "业绩事实不能为空");
        CrmDealPolicy.eventType(request.eventType(), request.bizType());
        source(request.eventType(), request.sourceService());
        identifier(request.bizId(), "来源业务ID");
        identifier(request.customerId(), "客户ID");
        if (request.teamVersion() == null || request.teamVersion() < 0) throw invalid("团队版本无效");
        List<CrmDealPolicy.Allocation> split = CrmDealPolicy.allocate(request.amount(), members, "RECEIPT".equals(request.eventType()));
        ObjectNode snapshot = snapshot(request.sourceService(), request.sourceVersion(), request.evidence());
        snapshot.set("members", json.valueToTree(split.stream().map(CrmDealPolicy.Allocation::member).toList()));
        CrmDealEvent event = create(request.eventKey(), request.eventType(), request.bizType(), request.bizId(), request.customerId(),
                CrmDealPolicy.money(request.amount()), request.currency(), request.occurredTime(), request.teamVersion(), request.baseline(), snapshot);
        List<CrmDealAllocation> entries = split.stream().map(this::allocation).toList();
        return persist(event, entries);
    }

    @Audit(name = "全额冲正原业绩及冻结分配", highRisk = true)
    @Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
    public CrmDealEvent reverse(Reversal request) {
        CrmRecordSupport.require(request, "冲正请求不能为空");
        identifier(request.eventId(), "原事实ID");
        CrmDealEvent original = CrmRecordSupport.require(events.lockById(request.eventId()), "原事实不存在");
        if (!Objects.equals(original.getTenantId(), CrmRecordSupport.tenantId()) || original.getReversalOfId() != null) throw invalid("冲正必须引用本租户的原始事实");
        CrmDealPolicy.eventType(original.getEventType(), original.getBizType());
        source(original.getEventType(), request.sourceService());
        CrmDealPolicy.money(original.getAmount());
        ObjectNode snapshot = snapshot(request.sourceService(), request.sourceVersion(), request.evidence());
        snapshot.put("reversalOfId", original.getEventId());
        snapshot.put("reason", CrmRecordSupport.text(request.reason(), 1000, "冲正原因"));
        CrmDealEvent reversal = create(request.eventKey(), original.getEventType(), original.getBizType(), original.getBizId(), original.getCustomerId(),
                original.getAmount().negate(), original.getCurrency(), request.occurredTime(), original.getTeamVersion(), Integer.valueOf(1).equals(original.getBaselineFlag()), snapshot);
        reversal.setReversalOfId(original.getEventId());
        List<CrmDealEvent> existing = events.lockReversals(original.getEventId());
        if (!existing.isEmpty()) {
            if (existing.size() != 1) throw invalid("原事实已有部分冲减，不能再次全额冲正");
            verifyIdentity(existing.get(0), reversal);
            return existing.get(0);
        }
        List<CrmDealAllocation> previous = allocations.lockByEvent(original.getEventId());
        if (previous.isEmpty() || previous.stream().map(CrmDealAllocation::getAllocatedAmount).reduce(BigDecimal.ZERO, BigDecimal::add).compareTo(original.getAmount()) != 0)
            throw invalid("原事实分配不完整，不能冲正");
        List<CrmDealAllocation> entries = new ArrayList<>();
        for (CrmDealAllocation source : previous) {
            if (!Objects.equals(source.getTenantId(), original.getTenantId()) || source.getReversalOfId() != null || source.getAllocatedAmount().signum() < 0)
                throw invalid("原分配来源无效");
            CrmDealAllocation entry = new CrmDealAllocation();
            BeanUtils.copyProperties(source, entry);
            entry.setAllocationId(null); entry.setEventId(null); entry.setCompChangeId(null);
            entry.setReversalOfId(source.getAllocationId()); entry.setAllocatedAmount(source.getAllocatedAmount().negate());
            entry.setCommissionAmount(source.getCommissionAmount() == null ? null : source.getCommissionAmount().negate());
            entry.setCommissionStatus(!"RECEIPT".equals(original.getEventType()) ? "NOT_APPLICABLE"
                    : source.getCommissionAmount() == null ? "UNCONFIRMED" : "READY");
            entries.add(entry);
        }
        return persist(reversal, entries);
    }

    @Audit(name = "按财务选定原收款冲减历史分配", highRisk = true)
    @Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
    public CrmDealEvent refund(Refund request) {
        CrmRecordSupport.require(request, "退款来源不能为空");
        identifier(request.eventId(), "原收款记录ID");
        CrmDealEvent original = CrmRecordSupport.require(events.lockById(request.eventId()), "原收款记录不存在");
        if (!Objects.equals(original.getTenantId(), CrmRecordSupport.tenantId()) || original.getReversalOfId() != null
                || !"RECEIPT".equals(original.getEventType()) || !"RECEIVABLE".equals(original.getBizType())
                || !Integer.valueOf(0).equals(original.getBaselineFlag())) throw invalid("退款必须引用本租户的真实原收款记录");
        BigDecimal amount = CrmDealPolicy.money(request.amount());
        if (amount.signum() <= 0) throw invalid("退款金额必须大于0");
        ObjectNode snapshot = snapshot("cloudflow-service-crm", request.sourceVersion(), request.evidence());
        snapshot.put("reversalOfId", original.getEventId());
        snapshot.put("reason", CrmRecordSupport.text(request.reason(), 1000, "退款原因"));
        CrmDealEvent reversal = create(request.eventKey(), "RECEIPT", "RECEIVABLE", original.getBizId(), original.getCustomerId(),
                amount.negate(), original.getCurrency(), request.occurredTime(), original.getTeamVersion(), false, snapshot);
        reversal.setReversalOfId(original.getEventId());
        CrmDealEvent duplicate = events.lockByKey(reversal.getEventKey());
        if (duplicate != null) { verifyIdentity(duplicate, reversal); return duplicate; }
        List<CrmDealAllocation> previous = new ArrayList<>();
        BigDecimal remaining = CrmDealPolicy.money(original.getAmount());
        for (CrmDealEvent prior : events.lockReversals(original.getEventId())) {
            if (!Objects.equals(prior.getTenantId(), original.getTenantId()) || !Objects.equals(prior.getBizId(), original.getBizId())
                    || !Objects.equals(prior.getEventType(), original.getEventType()) || !Objects.equals(prior.getBizType(), original.getBizType())
                    || !Objects.equals(prior.getCustomerId(), original.getCustomerId()) || !Objects.equals(prior.getCurrency(), original.getCurrency())
                    || !Objects.equals(prior.getTeamVersion(), original.getTeamVersion()) || prior.getAmount() == null || prior.getAmount().signum() > 0)
                throw invalid("已有退款事实与原收款不一致");
            List<CrmDealAllocation> priorEntries = allocations.lockByEvent(prior.getEventId());
            if (priorEntries.isEmpty() || priorEntries.stream().map(CrmDealAllocation::getAllocatedAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add).compareTo(prior.getAmount()) != 0) throw invalid("已有退款分配与退款金额不一致");
            remaining = remaining.add(prior.getAmount());
            previous.addAll(priorEntries);
        }
        if (amount.compareTo(remaining) > 0) throw invalid("退款金额超过所选原收款记录的剩余可退金额");
        List<CrmDealAllocation> sources = allocations.lockByEvent(original.getEventId());
        if (sources.stream().anyMatch(source -> !Objects.equals(source.getTenantId(), original.getTenantId()))) throw invalid("原收款分配租户不一致");
        List<CrmDealAllocation> entries = new ArrayList<>();
        for (CrmDealRefundPolicy.Portion portion : CrmDealRefundPolicy.allocate(original.getAmount(), amount, sources, previous)) {
            CrmDealAllocation entry = new CrmDealAllocation();
            BeanUtils.copyProperties(portion.original(), entry);
            entry.setAllocationId(null); entry.setEventId(null); entry.setCompChangeId(null);
            entry.setReversalOfId(portion.original().getAllocationId()); entry.setAllocatedAmount(portion.amount().negate());
            entry.setCommissionAmount(portion.commissionAmount() == null ? null : portion.commissionAmount().negate());
            entry.setCommissionStatus(portion.commissionAmount() == null ? "UNCONFIRMED" : "READY");
            entries.add(entry);
        }
        return persist(reversal, entries);
    }

    public CrmDealEvent find(String eventKey) {
        return events.selectOne(new LambdaQueryWrapper<CrmDealEvent>().eq(CrmDealEvent::getEventKey, key(eventKey)));
    }

    private CrmDealEvent persist(CrmDealEvent proposed, List<CrmDealAllocation> entries) {
        CrmDealEvent existing = find(proposed.getEventKey());
        if (existing != null) { verifyIdentity(existing, proposed); return existing; }
        try { CrmRecordSupport.saved(events.insert(proposed)); }
        catch (DuplicateKeyException duplicate) {
            CrmDealEvent winner = events.lockByKey(proposed.getEventKey());
            if (winner == null) throw duplicate;
            verifyIdentity(winner, proposed);
            return winner;
        }
        LocalDateTime created = LocalDateTime.now().withNano(0);
        for (CrmDealAllocation entry : entries) {
            entry.setTenantId(proposed.getTenantId()); entry.setEventId(proposed.getEventId());
            entry.setCreateBy(CrmRecordSupport.userName()); entry.setCreateTime(created);
            entry.setUpdateBy(CrmRecordSupport.userName()); entry.setUpdateTime(created);
            CrmRecordSupport.saved(allocations.insert(entry));
            if ("RECEIPT".equals(proposed.getEventType()) && entry.getReversalOfId() != null) commissions.recovery(entry.getAllocationId());
        }
        return proposed;
    }

    private CrmDealAllocation allocation(CrmDealPolicy.Allocation frozen) {
        CrmDealAllocation entry = new CrmDealAllocation();
        entry.setSalesUserId(frozen.member().userId()); entry.setEmployeeId(frozen.member().employeeId());
        entry.setDeptId(frozen.member().deptId()); entry.setRoleType(frozen.member().role());
        entry.setAllocatedPercentage(frozen.member().percentage()); entry.setAllocatedAmount(frozen.amount());
        entry.setCommissionRate("NOT_APPLICABLE".equals(frozen.commissionStatus()) ? null : frozen.member().commissionRate());
        entry.setCommissionAmount(frozen.commissionAmount()); entry.setCommissionStatus(frozen.commissionStatus());
        return entry;
    }

    private CrmDealEvent create(String eventKey, String eventType, String bizType, Long bizId, Long customerId,
            BigDecimal amount, String currency, LocalDateTime occurredTime, Integer teamVersion, boolean baseline, ObjectNode snapshot) {
        if (occurredTime == null || occurredTime.isAfter(LocalDateTime.now().plusSeconds(5))) throw invalid("事实发生时间无效");
        CrmDealEvent event = new CrmDealEvent();
        event.setTenantId(CrmRecordSupport.tenantId()); event.setEventKey(key(eventKey));
        event.setEventType(eventType); event.setBizType(bizType); event.setBizId(bizId); event.setCustomerId(customerId);
        event.setAmount(amount); event.setCurrency(CrmDealPolicy.currency(currency)); event.setOccurredTime(occurredTime.withNano(0));
        event.setTeamVersion(teamVersion); event.setSourceSnapshot(snapshot.toString()); event.setBaselineFlag(baseline ? 1 : 0);
        event.setCreateBy(CrmRecordSupport.userName()); event.setCreateTime(LocalDateTime.now().withNano(0));
        return event;
    }

    private ObjectNode snapshot(String sourceService, Integer sourceVersion, JsonNode evidence) {
        if (!Set.of("cloudflow-service-crm", "cloudflow-service-oa").contains(sourceService == null ? "" : sourceService)
                || sourceVersion == null || sourceVersion < 0 || evidence == null || !evidence.isObject() || evidence.isEmpty()) throw invalid("可信来源、版本和事实证据不能为空");
        ObjectNode snapshot = json.createObjectNode().put("schemaVersion", 1).put("sourceService", sourceService).put("sourceVersion", sourceVersion);
        snapshot.set("evidence", evidence.deepCopy());
        return snapshot;
    }

    private void verifyIdentity(CrmDealEvent existing, CrmDealEvent proposed) {
        boolean matches = Objects.equals(existing.getTenantId(), proposed.getTenantId()) && Objects.equals(existing.getEventKey(), proposed.getEventKey())
                && Objects.equals(existing.getEventType(), proposed.getEventType()) && Objects.equals(existing.getBizType(), proposed.getBizType())
                && Objects.equals(existing.getBizId(), proposed.getBizId()) && Objects.equals(existing.getCustomerId(), proposed.getCustomerId())
                && existing.getAmount().compareTo(proposed.getAmount()) == 0 && Objects.equals(existing.getCurrency(), proposed.getCurrency())
                && Objects.equals(existing.getOccurredTime(), proposed.getOccurredTime()) && Objects.equals(existing.getTeamVersion(), proposed.getTeamVersion())
                && Objects.equals(existing.getReversalOfId(), proposed.getReversalOfId()) && Objects.equals(existing.getBaselineFlag(), proposed.getBaselineFlag());
        try { matches = matches && json.readTree(existing.getSourceSnapshot()).equals(json.readTree(proposed.getSourceSnapshot())); }
        catch (Exception invalidSnapshot) { throw invalid("原事实来源快照无法核验"); }
        if (!matches) throw invalid("同源业绩事实内容不一致，已拒绝重复入账");
    }

    private static String key(String value) {
        if (value == null || !value.matches("[A-Za-z0-9:_-]{1,128}")) throw invalid("事实请求键无效");
        return value;
    }

    private static void identifier(Long value, String label) { if (value == null || value <= 0) throw invalid(label + "无效"); }
    private static void source(String eventType, String sourceService) {
        if (!Objects.equals("CONTRACT".equals(eventType) ? "cloudflow-service-oa" : "cloudflow-service-crm", sourceService))
            throw invalid("业绩事实与来源服务不一致");
    }
    private static CrmBusinessException invalid(String message) { return new CrmBusinessException(message); }
}
