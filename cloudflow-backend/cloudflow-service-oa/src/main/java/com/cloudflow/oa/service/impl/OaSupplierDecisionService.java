package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.oa.domain.SysSupplier;
import com.cloudflow.oa.domain.dto.OaApprovalRequest;
import com.cloudflow.oa.domain.dto.SupplierDecisionDTO;
import com.cloudflow.oa.mapper.OaIdentityReferenceMapper;
import com.cloudflow.oa.mapper.SysSupplierMapper;
import com.cloudflow.oa.service.OaApprovalParticipant;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class OaSupplierDecisionService implements OaApprovalParticipant {
    private final SysSupplierMapper suppliers;
    private final OaApprovalOutboxService approvals;
    private final SysConfigHelper config;
    private final OaIdentityReferenceMapper identities;
    private final com.cloudflow.oa.service.IOaTraceEventService trace;
    private final OaSupplierAuditService audit;

    @Transactional(rollbackFor = Exception.class)
    public void submitDecision(Long id, SupplierDecisionDTO decision) {
        SysSupplier supplier = OaRecordSupport.active(suppliers.selectForUpdate(id, OaRecordSupport.tenantId()));
        if (supplier.getInstanceId() != null && !supplier.getInstanceId().isBlank()) throw new IllegalArgumentException("供应商已有审批正在处理");
        String action = OaRecordSupport.code(decision.getAction(), null, Set.of("BLACKLIST", "UNBLACKLIST", "BYPASS"));
        String reason = OaRecordSupport.text(decision.getReason(), 500, "申请原因");
        if ("UNBLACKLIST".equals(action) && !Integer.valueOf(1).equals(supplier.getBlacklistFlag())) throw new IllegalArgumentException("供应商当前未在黑名单中");
        if ("BLACKLIST".equals(action) && Integer.valueOf(1).equals(supplier.getBlacklistFlag())) throw new IllegalArgumentException("供应商已在黑名单中");
        if ("BYPASS".equals(action) && OaRecordSupport.require(decision.getExpireDate(), "放行有效期不能为空").isBefore(LocalDate.now())) throw new IllegalArgumentException("放行有效期已过期");
        Long approver = config.getConfigLong("sys.oa.supplier.approverUserId", 1L);
        OaRecordSupport.require(identities.user(approver, OaRecordSupport.tenantId()), "供应商审批人未正确配置");
        Map<String, Object> values = new HashMap<>();
        values.put("action", action); values.put("reason", reason); values.put("supplierName", supplier.getSupplierName()); values.put("approverIds", java.util.List.of(approver.toString()));
        if ("BYPASS".equals(action)) values.put("expireDate", decision.getExpireDate().toString());
        OaSupplierAuditService.Snapshot before = OaSupplierAuditService.snapshot(supplier);
        supplier.setInstanceId(approvals.queue(getSupportedBusinessType(), id, supplier.getSupplierCode(), "oa_supplier_governance", values));
        OaRecordSupport.touch(supplier); OaRecordSupport.saved(suppliers.updateById(supplier));
        audit.record(OaSupplierAuditService.Action.GOVERNANCE_SUBMITTED, before,
                OaSupplierAuditService.snapshot(OaRecordSupport.active(suppliers.selectById(id))), values, null);
    }

    @Override
    public String getSupportedBusinessType() { return "OA_SUPPLIER_GOVERNANCE"; }

    @Override
    public String currentInstance(Long id) { return OaRecordSupport.active(suppliers.selectById(id)).getInstanceId(); }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void bindInstance(OaApprovalRequest request, String instanceId) {
        SysSupplier supplier = OaRecordSupport.active(suppliers.selectForUpdate(request.getBusinessId(), OaRecordSupport.tenantId()));
        if (!request.getReservation().equals(supplier.getInstanceId())) return;
        supplier.setInstanceId(instanceId); OaRecordSupport.touch(supplier); OaRecordSupport.saved(suppliers.updateById(supplier)); approvals.recordBinding(request, instanceId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void handleApproved(ApprovalResultDTO result) { applyDecision(result, true); }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void handleRejected(ApprovalResultDTO result) { applyDecision(result, false); }

    private void applyDecision(ApprovalResultDTO result, boolean accepted) {
        SysSupplier supplier = OaRecordSupport.active(suppliers.selectForUpdate(result.getBusinessId(), OaRecordSupport.tenantId()));
        if (!OaApprovalOutboxService.matches(supplier.getInstanceId(), result)) return;
        OaApprovalRequest request = approvals.snapshot(result);
        OaSupplierAuditService.Snapshot before = OaSupplierAuditService.snapshot(supplier);
        if (accepted) {
            Map<String, Object> values = request.getVariables();
            String action = values.get("action").toString(); String reason = values.get("reason").toString();
            if ("BYPASS".equals(action)) {
                LocalDate expires = LocalDate.parse(values.get("expireDate").toString());
                if (expires.isBefore(LocalDate.now())) {
                    trace.record(OaRecordSupport.tenantId(), "SUPPLIER", supplier.getSupplierId(), null, null, "BYPASS_EXPIRED_BEFORE_APPROVAL", "例外放行申请已过期", "审批已结束，本次申请未授予放行权限", request.getStartUserId(), request.getStartUserName(), null);
                } else {
                    supplier.setBypassFlag(1); supplier.setBypassReason(reason); supplier.setBypassBy(request.getStartUserId()); supplier.setBypassExpireDate(expires);
                }
            } else {
                supplier.setBlacklistFlag("BLACKLIST".equals(action) ? 1 : 0); supplier.setBlacklistReason(reason);
                supplier.setBlacklistBy(request.getStartUserId()); supplier.setBlacklistTime(LocalDateTime.now());
                if ("BLACKLIST".equals(action)) supplier.setBypassFlag(0);
            }
            OaRecordSupport.touch(supplier); OaRecordSupport.saved(suppliers.updateById(supplier));
        }
        OaRecordSupport.saved(suppliers.update(null, new LambdaUpdateWrapper<SysSupplier>().eq(SysSupplier::getSupplierId, supplier.getSupplierId())
                .eq(SysSupplier::getTenantId, OaRecordSupport.tenantId()).eq(SysSupplier::getInstanceId, result.getProcessInstanceId())
                .set(SysSupplier::getInstanceId, null).set(SysSupplier::getUpdateTime, LocalDateTime.now()).set(SysSupplier::getUpdateBy, "workflow")));
        audit.record(accepted ? OaSupplierAuditService.Action.GOVERNANCE_APPROVED : OaSupplierAuditService.Action.GOVERNANCE_REJECTED,
                before, OaSupplierAuditService.snapshot(OaRecordSupport.active(suppliers.selectById(supplier.getSupplierId()))),
                request.getVariables(), result);
    }
}
