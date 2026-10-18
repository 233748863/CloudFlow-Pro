package com.cloudflow.crm.service.opportunity;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.crm.domain.CrmContact;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmOpportunityStageHistory;
import com.cloudflow.crm.domain.CrmSalesStage;
import com.cloudflow.crm.mapper.CrmOpportunityStageHistoryMapper;
import com.cloudflow.crm.mapper.CrmSalesStageMapper;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
@RequiredArgsConstructor
public class CrmOpportunityStageService {
    private final CrmSalesStageService catalog;
    private final CrmSalesStageMapper stages;
    private final CrmOpportunityStageHistoryMapper histories;
    private final CrmOpportunityAccessService access;
    private final ObjectMapper json;

    public CrmOpportunityStagePolicy.Transition prepare(CrmOpportunity original, CrmOpportunity proposed,
            CrmOpportunityStagePolicy.Action action, String reason) {
        List<CrmSalesStage> rules = catalog.lockCatalog();
        if (proposed.getContactId() != null) {
            CrmContact contact = CrmRecordSupport.require(stages.lockContact(CrmRecordSupport.tenantId(), proposed.getContactId(), proposed.getCustomerId()), "联系人不属于该客户或已停用");
            proposed.setContactName(contact.getContactName());
        }
        boolean hasActivity = original != null && stages.activityCount(CrmRecordSupport.tenantId(), original.getOpportunityId(), proposed.getCustomerId()) != 0;
        return CrmOpportunityStagePolicy.apply(original, proposed, rules, action, reason, hasActivity, LocalDateTime.now());
    }

    public void record(CrmOpportunity opportunity, CrmOpportunityStagePolicy.Transition transition,
            String operationKey, String reason, Long operatorId) {
        record(opportunity, transition, operationKey, reason, operatorId, null);
    }

    public void record(CrmOpportunity opportunity, CrmOpportunityStagePolicy.Transition transition,
            String operationKey, String reason, Long operatorId, com.fasterxml.jackson.databind.JsonNode reopening) {
        if (!transition.changed()) return;
        if (!TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("阶段历史必须与商机同事务保存");
        CrmRecordSupport.require(operatorId, "阶段操作人缺失");
        if (operatorId <= 0) throw new IllegalArgumentException("阶段操作人无效");
        CrmOpportunityStageHistory history = new CrmOpportunityStageHistory();
        history.setTenantId(CrmRecordSupport.tenantId()); history.setOpportunityId(opportunity.getOpportunityId());
        history.setFromStage(transition.source() == null ? null : transition.source().getStageCode()); history.setToStage(transition.target().getStageCode());
        history.setEnteredTime(transition.enteredTime()); history.setChangedTime(transition.changedTime()); history.setDurationSeconds(transition.durationSeconds());
        history.setOperationKey(CrmRecordSupport.text(operationKey, 128, "阶段来源")); history.setReason(reason);
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("direction", transition.direction()); snapshot.put("sourceStage", transition.source()); snapshot.put("targetStage", transition.target());
        snapshot.put("opportunityVersion", opportunity.getVersion()); snapshot.put("expectedAmount", opportunity.getExpectedAmount());
        snapshot.put("winRate", opportunity.getWinRate()); snapshot.put("weightedAmount", opportunity.getWeightedAmount());
        if (reopening != null) snapshot.put("reopen", reopening);
        try { history.setSnapshot(json.writeValueAsString(snapshot)); }
        catch (Exception invalid) { throw new IllegalStateException("阶段来源快照保存失败", invalid); }
        history.setOperatorId(operatorId); history.setCreateBy(CrmRecordSupport.userName()); history.setCreateTime(transition.changedTime());
        CrmRecordSupport.saved(histories.insert(history));
    }

    public PageResult<CrmOpportunityStageHistory> history(Long id, PageQuery page) {
        access.read(id);
        return PageResult.build(histories.selectPage(page.build(), new LambdaQueryWrapper<CrmOpportunityStageHistory>()
                .eq(CrmOpportunityStageHistory::getOpportunityId, id).orderByDesc(CrmOpportunityStageHistory::getHistoryId)));
    }
}
