package com.cloudflow.oa.service.impl;

import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.job.config.JobInvocationContext;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.oa.domain.OaSupplierScorecard;
import com.cloudflow.oa.domain.SysSupplier;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class OaSupplierAuditService {
    private final SysAuditLogMapper mapper;
    private final ObjectMapper json;

    public enum Action {
        SCORE_CONFIRMED("确认供应商评分", true),
        GOVERNANCE_SUBMITTED("提交供应商治理审批", true),
        GOVERNANCE_APPROVED("供应商治理审批通过", true),
        GOVERNANCE_REJECTED("供应商治理审批驳回", false),
        ADMISSION_BLOCKED("供应商准入拦截", true);

        private final String title;
        private final boolean highRisk;

        Action(String title, boolean highRisk) {
            this.title = title;
            this.highRisk = highRisk;
        }
    }

    public record SupplierState(Long tenantId, Long supplierId, String supplierCode, String supplierName,
                                String status, Integer version, BigDecimal score, String standing, String indicatorColor,
                                LocalDateTime lastScoreTime, Integer blacklistFlag, String blacklistReason,
                                Long blacklistBy, LocalDateTime blacklistTime, Integer preventPurchaseFlag,
                                Integer preventRfqFlag, Integer bypassFlag, String bypassReason, Long bypassBy,
                                LocalDate bypassExpireDate, String instanceId) { }

    public record ScorecardState(Long scorecardId, String periodType, LocalDate periodStart, LocalDate periodEnd,
                                 String status, BigDecimal totalScore, String standing, String indicatorColor) { }

    public record Snapshot(SupplierState supplier, ScorecardState scorecard) { }

    private record Approval(String processInstanceId, String result, Long approverId, String approverName,
                            Long approvalTime) { }

    private record Entry(String action, Long supplierId, String supplierCode, Long operatorId, String operatorName,
                         Long executorId, Approval approval, JobInvocationContext.Execution job, Snapshot state,
                         Map<String, ?> details) { }

    public static Snapshot snapshot(SysSupplier supplier) {
        return new Snapshot(new SupplierState(supplier.getTenantId(), supplier.getSupplierId(), supplier.getSupplierCode(),
                supplier.getSupplierName(), supplier.getStatus(), supplier.getVersion(), supplier.getScore(),
                supplier.getStanding(), supplier.getIndicatorColor(), supplier.getLastScoreTime(),
                supplier.getBlacklistFlag(), supplier.getBlacklistReason(), supplier.getBlacklistBy(),
                supplier.getBlacklistTime(), supplier.getPreventPurchaseFlag(), supplier.getPreventRfqFlag(),
                supplier.getBypassFlag(), supplier.getBypassReason(), supplier.getBypassBy(),
                supplier.getBypassExpireDate(), supplier.getInstanceId()), null);
    }

    public static Snapshot scorecard(SysSupplier supplier, OaSupplierScorecard card) {
        return new Snapshot(snapshot(supplier).supplier(), new ScorecardState(card.getScorecardId(), card.getPeriodType(),
                card.getPeriodStart(), card.getPeriodEnd(), card.getStatus(), card.getTotalScore(),
                card.getStanding(), card.getIndicatorColor()));
    }

    @Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
    public void record(Action action, Snapshot before, Snapshot after, Map<String, ?> details, ApprovalResultDTO decision) {
        write(action, before, after, details, decision);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public void blocked(Snapshot state, String scene, String reason) {
        write(Action.ADMISSION_BLOCKED, state, state, Map.of("scene", scene, "reason", reason), null);
    }

    private void write(Action action, Snapshot before, Snapshot after, Map<String, ?> details, ApprovalResultDTO decision) {
        Long tenantId = OaRecordSupport.tenantId();
        OaRecordSupport.same(tenantId, before.supplier().tenantId(), "供应商审计归属不一致");
        OaRecordSupport.same(tenantId, after.supplier().tenantId(), "供应商审计归属不一致");
        OaRecordSupport.same(before.supplier().supplierId(), after.supplier().supplierId(), "供应商审计编号不一致");
        if (decision != null) OaRecordSupport.same(tenantId, decision.getTenantId(), "供应商审批审计归属不一致");
        boolean hasApprover = decision != null && decision.getApproverId() != null;
        Long operatorId = hasApprover ? decision.getApproverId() : UserContext.getUserId();
        String operatorName = hasApprover ? decision.getApproverName() : OaRecordSupport.userName();
        if (operatorName == null || operatorName.isBlank()) operatorName = operatorId == null ? "system" : operatorId.toString();
        Approval approval = decision == null ? null : new Approval(decision.getProcessInstanceId(), decision.getApprovalResult(),
                decision.getApproverId(), decision.getApproverName(), decision.getApprovalTime());
        SysAuditLogEntity audit = new SysAuditLogEntity();
        audit.setTenantId(tenantId);
        audit.setBizModule("oa");
        audit.setAuditName(action.title);
        audit.setAuditField(action.name());
        audit.setHighRisk(action.highRisk ? 1 : 0);
        audit.setRiskLevel(action.highRisk ? "HIGH" : "NORMAL");
        audit.setCreateBy(operatorName.length() <= 64 ? operatorName : String.valueOf(operatorId));
        audit.setCreateTime(LocalDateTime.now());
        try {
            audit.setBeforeJson(json.writeValueAsString(new Entry(action.name(), before.supplier().supplierId(),
                    before.supplier().supplierCode(), operatorId, operatorName, UserContext.getUserId(), approval,
                    JobInvocationContext.execution(), before, details)));
            audit.setAfterJson(json.writeValueAsString(new Entry(action.name(), after.supplier().supplierId(),
                    after.supplier().supplierCode(), operatorId, operatorName, UserContext.getUserId(), approval,
                    JobInvocationContext.execution(), after, details)));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("供应商审计快照保存失败", exception);
        }
        OaRecordSupport.saved(mapper.insert(audit));
    }
}
