package com.cloudflow.crm.service.opportunity;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.crm.domain.CrmCampaign;
import com.cloudflow.crm.domain.CrmDealEvent;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmOpportunityStageHistory;
import com.cloudflow.crm.domain.dto.CrmOpportunityReopenRequest;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.mapper.CrmOpportunityReopenMapper;
import com.cloudflow.crm.service.deal.CrmDealLedgerService;
import com.cloudflow.crm.service.impl.CrmCampaignWonService;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CrmOpportunityReopenService {
    private final CrmOpportunityAccessService access;
    private final CrmOpportunityMapper opportunities;
    private final CrmOpportunityReopenMapper sources;
    private final CrmOpportunityReopenFinanceService finance;
    private final CrmOpportunityReopenLedgerService proof;
    private final CrmOpportunityStageService stages;
    private final CrmDealLedgerService ledger;
    private final CrmCampaignWonService campaignWins;
    private final ObjectMapper json;

    public record Receipt(Long historyId, int originalVersion, int version, String fromStage, String targetStage,
            String reason, Long operatorId, LocalDateTime changedTime, Long originalEventId, Long reversalEventId) { }
    public record View(Long opportunityId, String opportunityName, String stage, Integer version, boolean allowed,
            List<String> blockers, Long winningEventId, BigDecimal amount, String currency, Integer teamVersion,
            List<CrmOpportunityReopenLedgerService.Share> shares, int retainedContracts, Receipt lastReopen) { }
    private record Inspection(View view, CrmDealEvent original, ObjectNode evidence) { }

    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public View inspect(Long id) { return examine(access.lockInScope(id)).view(); }

    @Audit(name = "恢复终态商机并冲减原赢单业绩", highRisk = true)
    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public Receipt restore(Long id, CrmOpportunityReopenRequest request) {
        CrmRecordSupport.require(request, "恢复请求不能为空");
        String reason = CrmRecordSupport.text(request.reason(), 1000, "恢复原因");
        CrmCampaign campaign = campaignWins.lock(access.read(id));
        CrmOpportunity original = access.lockInScope(id);
        CrmOpportunityStagePolicy.version(request.version(), original);
        if (original.getVersion() == Integer.MAX_VALUE) throw invalid("商机业务版本已达到上限");
        if (!Objects.equals(campaign == null ? null : campaign.getCampaignId(), original.getCampaignId()))
            throw invalid("商机关联活动已改变，请重新读取后提交");
        Inspection inspection = examine(original);
        if (!inspection.view().allowed()) throw invalid(String.join("；", inspection.view().blockers()));
        CrmOpportunity next = new CrmOpportunity(); BeanUtils.copyProperties(original, next);
        next.setStage(CrmOpportunityStagePolicy.code(request.targetStage())); next.setLostReason(null);
        CrmOpportunityStagePolicy.Transition transition = stages.prepare(original, next, CrmOpportunityStagePolicy.Action.REOPEN, reason);
        next.setVersion(original.getVersion() + 1);
        ObjectNode evidence = inspection.evidence();
        evidence.put("originalVersion", original.getVersion()).put("originalStage", original.getStage())
                .put("originalStatus", original.getStatus()).put("originalTeamVersion", original.getTeamVersion());
        evidence.put("originalLostReason", original.getLostReason());
        evidence.set("originalLostDetails", json.valueToTree(sources.lostDetails(id, original.getTenantId())));
        CrmOpportunityStageHistory previous = sources.latestHistory(id, original.getTenantId());
        if (previous != null) evidence.put("originalHistoryId", previous.getHistoryId());
        CrmDealEvent winning = inspection.original();
        if (winning != null) {
            evidence.put("originalEventId", winning.getEventId());
            CrmDealEvent reversal = ledger.reverse(new CrmDealLedgerService.Reversal(winning.getEventId(),
                    "CRM_REOPEN:" + id + ":V:" + next.getVersion(), transition.changedTime(),
                    "cloudflow-service-crm", next.getVersion(), reason, evidence));
            evidence.put("reversalEventId", reversal.getEventId());
        }
        CrmRecordSupport.touch(next);
        CrmRecordSupport.saved(opportunities.writeOpportunity(next, original.getVersion()));
        sources.clearLostDetails(id, original.getTenantId());
        stages.record(next, transition, "CRM_OPPORTUNITY:" + id + ":VERSION:" + next.getVersion(), reason, UserContext.getUserId(), evidence);
        campaignWins.refresh(campaign, next);
        return receipt(id);
    }

    private Inspection examine(CrmOpportunity opportunity) {
        List<String> blockers = new ArrayList<>();
        boolean terminal = "WON".equals(opportunity.getStage()) || "LOST".equals(opportunity.getStage());
        if (!terminal || !"CLOSED".equals(opportunity.getStatus())) blockers.add("只有已结案的赢单或丢单商机可以恢复进行中");
        CrmDealEvent winning = null;
        List<CrmOpportunityReopenLedgerService.Share> shares = List.of();
        CrmOpportunityReopenFinanceService.Check financial = finance.inspect(opportunity);
        blockers.addAll(financial.blockers());
        List<CrmDealEvent> events = sources.events("OPPORTUNITY", opportunity.getOpportunityId(), opportunity.getTenantId());
        try {
            if ("WON".equals(opportunity.getStage())) {
                winning = proof.winning(opportunity, sources.latestHistory(opportunity.getOpportunityId(), opportunity.getTenantId()), events);
                shares = proof.shares(winning);
            } else if (!proof.settled(events)) blockers.add("历史赢单事实尚未完整冲减，请先核对原账");
        } catch (IllegalArgumentException failure) { blockers.add(failure.getMessage()); }
        View view = new View(opportunity.getOpportunityId(), opportunity.getOpportunityName(), opportunity.getStage(), opportunity.getVersion(),
                blockers.isEmpty(), List.copyOf(blockers), winning == null ? null : winning.getEventId(), winning == null ? null : winning.getAmount(),
                winning == null ? null : winning.getCurrency(), winning == null ? null : winning.getTeamVersion(), shares,
                financial.retainedContracts(), receipt(opportunity.getOpportunityId()));
        return new Inspection(view, winning, financial.evidence());
    }

    private Receipt receipt(Long id) {
        CrmOpportunityStageHistory history = sources.latestReopen(id, CrmRecordSupport.tenantId());
        if (history == null) return null;
        JsonNode snapshot = proof.parse(history.getSnapshot());
        JsonNode reopening = snapshot.path("reopen");
        return new Receipt(history.getHistoryId(), reopening.path("originalVersion").asInt(-1), snapshot.path("opportunityVersion").asInt(-1),
                history.getFromStage(), history.getToStage(), history.getReason(), history.getOperatorId(), history.getChangedTime(),
                reopening.hasNonNull("originalEventId") ? reopening.path("originalEventId").longValue() : null,
                reopening.hasNonNull("reversalEventId") ? reopening.path("reversalEventId").longValue() : null);
    }

    private static CrmBusinessException invalid(String message) { return new CrmBusinessException(message); }
}
