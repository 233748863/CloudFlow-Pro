package com.cloudflow.crm.service.impl;

import com.cloudflow.crm.exception.CrmBusinessException;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.crm.domain.CrmLead;
import com.cloudflow.crm.domain.CrmLeadScoreRule;
import com.cloudflow.crm.mapper.CrmLeadMapper;
import com.cloudflow.crm.mapper.CrmLeadScoreRuleMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class CrmLeadScoreService {
    private final CrmLeadScoreRuleMapper mapper;
    private final CrmLeadMapper leads;
    private final CrmReferenceService references;
    private final OutboxPublisher outbox;
    private final ObjectMapper json;

    public List<CrmLeadScoreRule> rules() {
        return mapper.selectList(new LambdaQueryWrapper<CrmLeadScoreRule>().eq(CrmLeadScoreRule::getDeleted, 0)
                .orderByAsc(CrmLeadScoreRule::getSortNo).orderByAsc(CrmLeadScoreRule::getRuleId));
    }

    @Audit(name = "维护线索评分规则", diff = true)
    @Transactional(rollbackFor = Exception.class)
    public CrmLeadScoreRule save(CrmLeadScoreRule rule) {
        CrmRecordSupport.require(rule, "评分规则不能为空");
        rule.setRuleName(CrmRecordSupport.text(rule.getRuleName(), 120, "评分规则名称"));
        rule.setEnabledFlag(rule.getEnabledFlag() == null ? 1 : CrmRecordSupport.flag(rule.getEnabledFlag()));
        if (rule.getSortNo() == null) rule.setSortNo(0);
        CrmLeadScoreEngine.validate(rule);
        if (rule.getRuleId() == null) { CrmRecordSupport.create(rule, "ruleId"); mapper.insert(rule); }
        else { CrmRecordSupport.update(rule, mapper.selectById(rule.getRuleId())); CrmRecordSupport.saved(mapper.updateById(rule)); }
        return rule;
    }

    public void score(CrmLead lead) {
        lead.setLeadScore(CrmLeadScoreEngine.calculate(lead, rules())); lead.setScoreUpdatedTime(LocalDateTime.now());
    }

    @Transactional(rollbackFor = Exception.class)
    public int recalculate(Long id) {
        CrmLead lead = references.lead(id);
        DataScopeUtils.assertOwnership(lead, CrmLead::getOwnerId, "线索");
        score(lead); persistScore(lead);
        return lead.getLeadScore();
    }

    @Transactional(rollbackFor = Exception.class)
    public String submitBatch(List<Long> requested) {
        if (requested == null || requested.isEmpty() || requested.size() > 500) throw new CrmBusinessException("每次请选择1至500条线索");
        List<Long> ids = requested.stream().distinct().toList();
        for (Long id : ids) DataScopeUtils.assertOwnership(references.lead(id), CrmLead::getOwnerId, "线索");
        try {
            BusinessEventEnvelope envelope = BusinessEventEnvelope.builder().eventType("CRM_LEAD_SCORE_RECALC")
                    .tenantId(CrmRecordSupport.tenantId()).sourceModule("cloudflow-crm").sourceId(ids.get(0)).payload(json.writeValueAsString(ids)).build();
            outbox.publish(envelope); return envelope.getEventId();
        } catch (JsonProcessingException exception) { throw new IllegalStateException("评分任务入队失败", exception); }
    }

    @Transactional(rollbackFor = Exception.class)
    public void runBatch(List<Long> ids) {
        List<CrmLeadScoreRule> activeRules = rules();
        for (Long id : ids) {
            CrmLead lead = leads.lockById(id);
            if (lead == null) continue;
            lead.setLeadScore(CrmLeadScoreEngine.calculate(lead, activeRules)); lead.setScoreUpdatedTime(LocalDateTime.now());
            persistScore(lead);
        }
    }

    private void persistScore(CrmLead lead) {
        CrmRecordSupport.saved(leads.update(null, new LambdaUpdateWrapper<CrmLead>().eq(CrmLead::getLeadId, lead.getLeadId())
                .eq(CrmLead::getVersion, lead.getVersion()).set(CrmLead::getLeadScore, lead.getLeadScore())
                .set(CrmLead::getScoreUpdatedTime, lead.getScoreUpdatedTime()).set(CrmLead::getVersion, lead.getVersion() + 1)
                .set(CrmLead::getUpdateBy, CrmRecordSupport.userName()).set(CrmLead::getUpdateTime, LocalDateTime.now())));
    }
}
