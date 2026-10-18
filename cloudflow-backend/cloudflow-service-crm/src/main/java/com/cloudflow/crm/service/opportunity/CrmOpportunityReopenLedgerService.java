package com.cloudflow.crm.service.opportunity;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.crm.domain.CrmDealAllocation;
import com.cloudflow.crm.domain.CrmDealEvent;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmOpportunityStageHistory;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmDealAllocationMapper;
import com.cloudflow.crm.service.deal.CrmDealPolicy;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class CrmOpportunityReopenLedgerService {
    private final CrmDealAllocationMapper allocations;
    private final ObjectMapper json;

    public record Share(Long userId, String name, String roleType, BigDecimal percentage, BigDecimal amount) { }

    public CrmDealEvent winning(CrmOpportunity opportunity, CrmOpportunityStageHistory history, List<CrmDealEvent> events) {
        if (history == null || !"WON".equals(history.getToStage()) || !Objects.equals(history.getOpportunityId(), opportunity.getOpportunityId())
                || !Objects.equals(history.getTenantId(), opportunity.getTenantId())
                || !Objects.equals(history.getChangedTime(), opportunity.getStageChangedTime())) throw invalid("缺少本次赢单阶段历史，请先核对原始记录");
        JsonNode stage = parse(history.getSnapshot());
        JsonNode version = stage.path("opportunityVersion");
        if (!"WON".equals(stage.path("direction").asText()) || !version.canConvertToInt() || version.intValue() < 0
                || opportunity.getVersion() == null || version.intValue() > opportunity.getVersion()) throw invalid("本次赢单业务版本无法核验");
        String key = "CRM_WON:" + opportunity.getOpportunityId() + ":V:" + version.intValue();
        CrmDealEvent original = events.stream().filter(event -> key.equals(event.getEventKey())).findFirst()
                .orElseThrow(() -> invalid("缺少本次赢单冻结事实，暂不可恢复；请先核对原始记录"));
        JsonNode source = parse(original.getSourceSnapshot());
        JsonNode evidence = source.path("evidence");
        if (!"WON".equals(original.getEventType()) || !"OPPORTUNITY".equals(original.getBizType()) || original.getReversalOfId() != null
                || !Integer.valueOf(0).equals(original.getBaselineFlag()) || !"CNY".equals(original.getCurrency())
                || !Objects.equals(original.getTenantId(), opportunity.getTenantId()) || !Objects.equals(original.getBizId(), opportunity.getOpportunityId())
                || !Objects.equals(original.getCustomerId(), opportunity.getCustomerId()) || !Objects.equals(original.getOccurredTime(), history.getChangedTime())
                || original.getAmount() == null || original.getAmount().compareTo(opportunity.getExpectedAmount()) != 0
                || !source.path("sourceVersion").equals(version) || !"cloudflow-service-crm".equals(source.path("sourceService").asText())
                || source.path("schemaVersion").asInt() != 1 || evidence.path("opportunityId").asLong(-1) != opportunity.getOpportunityId()
                || evidence.path("customerId").asLong(-1) != opportunity.getCustomerId() || !"WON".equals(evidence.path("stage").asText())
                || !"CLOSED".equals(evidence.path("status").asText()) || original.getTeamVersion() == null || original.getTeamVersion() < 0)
            throw invalid("本次赢单冻结事实与商机、版本或历史不一致");
        if (events.stream().anyMatch(event -> Objects.equals(event.getReversalOfId(), original.getEventId())))
            throw invalid("本次赢单事实已存在冲减，请先核对阶段与原账");
        if (!settled(events.stream().filter(event -> !Objects.equals(event.getEventId(), original.getEventId())).toList()))
            throw invalid("其他历史赢单事实尚未完整冲减，请先核对原账");
        shares(original);
        return original;
    }

    public List<Share> shares(CrmDealEvent event) {
        List<CrmDealPolicy.Member> members;
        try { members = List.of(json.treeToValue(parse(event.getSourceSnapshot()).path("members"), CrmDealPolicy.Member[].class)); }
        catch (Exception failure) { throw invalid("原赢单冻结成员无法核验"); }
        List<CrmDealPolicy.Allocation> expected = CrmDealPolicy.allocate(event.getAmount(), members, false);
        List<CrmDealAllocation> stored = entries(event);
        if (stored.size() != expected.size()) throw invalid("原赢单分配不完整，暂不可恢复");
        for (CrmDealPolicy.Allocation share : expected) {
            CrmDealPolicy.Member member = share.member();
            CrmDealAllocation row = stored.stream().filter(entry -> Objects.equals(entry.getSalesUserId(), member.userId())).findFirst()
                    .orElseThrow(() -> invalid("原赢单成员分配缺失"));
            if (!Objects.equals(row.getEmployeeId(), member.employeeId()) || !Objects.equals(row.getDeptId(), member.deptId())
                    || !Objects.equals(row.getRoleType(), member.role()) || row.getAllocatedPercentage().compareTo(member.percentage()) != 0
                    || row.getAllocatedAmount().compareTo(share.amount()) != 0 || row.getReversalOfId() != null
                    || !"NOT_APPLICABLE".equals(row.getCommissionStatus())) throw invalid("原赢单成员分配与冻结依据不一致");
        }
        return expected.stream().map(share -> new Share(share.member().userId(), share.member().name(), share.member().role(),
                share.member().percentage(), share.amount())).toList();
    }

    public boolean settled(List<CrmDealEvent> events) {
        Map<Long, CrmDealEvent> originals = new HashMap<>();
        for (CrmDealEvent event : events) {
            if (!Objects.equals(event.getTenantId(), CrmRecordSupport.tenantId()) || event.getAmount() == null) return false;
            if (event.getReversalOfId() == null && (event.getAmount().signum() < 0 || originals.put(event.getEventId(), event) != null)) return false;
        }
        for (CrmDealEvent event : events) if (event.getReversalOfId() != null && !originals.containsKey(event.getReversalOfId())) return false;
        for (CrmDealEvent original : originals.values()) {
            List<CrmDealEvent> reversals = events.stream().filter(event -> Objects.equals(event.getReversalOfId(), original.getEventId())).toList();
            if (reversals.isEmpty() || reversals.stream().anyMatch(event -> !sameOrigin(original, event))
                    || reversals.stream().map(CrmDealEvent::getAmount).reduce(original.getAmount(), BigDecimal::add).signum() != 0) return false;
            Map<Long, CrmDealAllocation> originalEntries = new HashMap<>();
            Map<Long, BigDecimal> balances = new HashMap<>();
            Map<Long, BigDecimal> commissions = new HashMap<>();
            for (CrmDealAllocation entry : entries(original)) {
                if (entry.getReversalOfId() != null || entry.getAllocatedAmount().signum() < 0) return false;
                originalEntries.put(entry.getAllocationId(), entry); balances.put(entry.getAllocationId(), entry.getAllocatedAmount());
                if (entry.getCommissionAmount() != null) commissions.put(entry.getAllocationId(), entry.getCommissionAmount());
            }
            for (CrmDealEvent reversal : reversals) for (CrmDealAllocation entry : entries(reversal)) {
                CrmDealAllocation prior = originalEntries.get(entry.getReversalOfId());
                if (prior == null || entry.getAllocatedAmount().signum() > 0 || !Objects.equals(entry.getSalesUserId(), prior.getSalesUserId())
                        || !Objects.equals(entry.getEmployeeId(), prior.getEmployeeId()) || !Objects.equals(entry.getDeptId(), prior.getDeptId())
                        || !Objects.equals(entry.getRoleType(), prior.getRoleType()) || entry.getAllocatedPercentage().compareTo(prior.getAllocatedPercentage()) != 0
                        || (entry.getCommissionAmount() == null) != (prior.getCommissionAmount() == null)) return false;
                balances.merge(prior.getAllocationId(), entry.getAllocatedAmount(), BigDecimal::add);
                if (entry.getCommissionAmount() != null) commissions.merge(prior.getAllocationId(), entry.getCommissionAmount(), BigDecimal::add);
            }
            if (balances.values().stream().anyMatch(amount -> amount.signum() != 0) || commissions.values().stream().anyMatch(amount -> amount.signum() != 0)) return false;
        }
        return true;
    }

    private List<CrmDealAllocation> entries(CrmDealEvent event) {
        List<CrmDealAllocation> rows = allocations.selectList(new LambdaQueryWrapper<CrmDealAllocation>()
                .eq(CrmDealAllocation::getEventId, event.getEventId()).orderByAsc(CrmDealAllocation::getSalesUserId));
        if (rows.isEmpty() || rows.stream().anyMatch(entry -> !Objects.equals(entry.getTenantId(), event.getTenantId())
                || entry.getAllocatedAmount() == null || entry.getAllocatedPercentage() == null)
                || rows.stream().map(CrmDealAllocation::getSalesUserId).distinct().count() != rows.size()
                || rows.stream().map(CrmDealAllocation::getAllocatedAmount).reduce(BigDecimal.ZERO, BigDecimal::add).compareTo(event.getAmount()) != 0)
            throw invalid("原事实的成员分配不完整，暂不可恢复");
        return rows;
    }

    private boolean sameOrigin(CrmDealEvent original, CrmDealEvent reversal) {
        return reversal.getAmount().signum() <= 0 && Objects.equals(original.getEventType(), reversal.getEventType())
                && Objects.equals(original.getBizType(), reversal.getBizType()) && Objects.equals(original.getBizId(), reversal.getBizId())
                && Objects.equals(original.getCustomerId(), reversal.getCustomerId()) && Objects.equals(original.getCurrency(), reversal.getCurrency())
                && Objects.equals(original.getTeamVersion(), reversal.getTeamVersion()) && Objects.equals(original.getBaselineFlag(), reversal.getBaselineFlag());
    }

    public JsonNode parse(String value) {
        try { JsonNode node = json.reader().with(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS).readTree(value); if (node != null && node.isObject()) return node; }
        catch (Exception failure) { throw invalid("历史来源快照无法核验"); }
        throw invalid("历史来源快照无法核验");
    }

    private static CrmBusinessException invalid(String message) { return new CrmBusinessException(message); }
}
