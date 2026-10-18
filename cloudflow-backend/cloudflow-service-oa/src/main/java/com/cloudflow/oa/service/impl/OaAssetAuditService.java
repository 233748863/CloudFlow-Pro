package com.cloudflow.oa.service.impl;

import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.job.config.JobInvocationContext;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.oa.domain.OaAssetMovement;
import com.cloudflow.oa.domain.OaAssetRepair;
import com.cloudflow.oa.domain.SysAsset;
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

/** 资产审计与业务变更共用事务，包含内部调用及集中任务，不依赖编号参数的差异比较。 */
@Service
@RequiredArgsConstructor
@Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
public class OaAssetAuditService {
    private final SysAuditLogMapper mapper;
    private final ObjectMapper json;

    public enum Action {
        PLAN_GENERATED("生成资产折旧计划", "ASSET", false),
        DEPRECIATION_POSTED("资产折旧过账", "ASSET", true),
        DEPRECIATION_CANCELLED("取消未过账折旧", "ASSET", true),
        REPAIR_ADJUSTED("维修费用资本化及延寿", "REPAIR", true),
        REPAIR_SAVED("保存资产维修单", "REPAIR", false),
        REPAIR_SUBMITTED("提交资产维修审批", "REPAIR", true),
        REPAIR_COMPLETED("完成资产维修", "REPAIR", true),
        REPAIR_DECIDED("资产维修审批结果", "REPAIR", true),
        MOVEMENT_SAVED("保存资产调拨单", "MOVEMENT", false),
        MOVEMENT_SUBMITTED("提交资产调拨审批", "MOVEMENT", true),
        MOVEMENT_EXECUTED("执行资产调拨", "MOVEMENT", true),
        MOVEMENT_DECIDED("资产调拨审批结果", "MOVEMENT", true);

        private final String title;
        private final String businessType;
        private final boolean highRisk;

        Action(String title, String businessType, boolean highRisk) {
            this.title = title; this.businessType = businessType; this.highRisk = highRisk;
        }
    }

    public record AssetState(Long tenantId, Long assetId, String assetCode, String status,
                             BigDecimal purchaseAmount, BigDecimal salvageValue, BigDecimal accumulatedDepreciation,
                             BigDecimal netBookValue, Integer usefulLifeMonths, String depreciationMethod,
                             String depreciationFrequency, Integer depreciationCompletedFlag, LocalDate nextDepreciationDate,
                             Long ownerId, Long custodianId, Long deptId, String location, LocalDate disposalDate) { }

    public record RepairState(Long repairId, String repairNo, String status, BigDecimal repairCost,
                              Integer capitalizeFlag, Integer lifeExtensionMonths, String instanceId, LocalDate completionDate) { }

    public record MovementState(Long movementId, String movementNo, String purpose, String status, String instanceId,
                                Long fromCustodianId, Long toCustodianId, Long fromDeptId, Long toDeptId,
                                String fromLocation, String toLocation, LocalDate movementDate) { }

    public record Snapshot(AssetState asset, RepairState repair, MovementState movement) { }

    private record Approval(String processInstanceId, String result, Long approverId, String approverName, Long approvalTime) { }
    private record Entry(String action, Long assetId, String businessType, Long businessId, Long operatorId, String operatorName,
                         Long executorId, Approval approval, JobInvocationContext.Execution job, Snapshot state, Map<String, ?> details) { }

    public static Snapshot snapshot(SysAsset asset) {
        return new Snapshot(new AssetState(asset.getTenantId(), asset.getAssetId(), asset.getAssetCode(), asset.getStatus(),
                asset.getPurchaseAmount(), asset.getSalvageValue(), asset.getAccumulatedDepreciation(), asset.getNetBookValue(),
                asset.getUsefulLifeMonths(), asset.getDepreciationMethod(), asset.getDepreciationFrequency(),
                asset.getDepreciationCompletedFlag(), asset.getNextDepreciationDate(), asset.getOwnerId(), asset.getCustodianId(),
                asset.getDeptId(), asset.getLocation(), asset.getDisposalDate()), null, null);
    }

    public static Snapshot repair(SysAsset asset, OaAssetRepair repair) {
        return new Snapshot(snapshot(asset).asset(), repair == null ? null : new RepairState(repair.getRepairId(), repair.getRepairNo(),
                repair.getRepairStatus(), repair.getRepairCost(), repair.getCapitalizeFlag(), repair.getLifeExtensionMonths(),
                repair.getInstanceId(), repair.getCompletionDate()), null);
    }

    public static Snapshot movement(SysAsset asset, OaAssetMovement movement) {
        return new Snapshot(snapshot(asset).asset(), null, movement == null ? null : new MovementState(movement.getMovementId(),
                movement.getMovementNo(), movement.getPurpose(), movement.getStatus(), movement.getInstanceId(), movement.getFromCustodianId(),
                movement.getToCustodianId(), movement.getFromDeptId(), movement.getToDeptId(), movement.getFromLocation(),
                movement.getToLocation(), movement.getMovementDate()));
    }

    public void record(Action action, Long businessId, Snapshot before, Snapshot after) {
        record(action, businessId, before, after, Map.of(), null);
    }

    public void record(Action action, Long businessId, Snapshot before, Snapshot after, Map<String, ?> details, ApprovalResultDTO decision) {
        Long tenantId = OaRecordSupport.tenantId();
        OaRecordSupport.same(tenantId, before.asset().tenantId(), "资产审计归属不一致");
        OaRecordSupport.same(tenantId, after.asset().tenantId(), "资产审计归属不一致");
        OaRecordSupport.same(before.asset().assetId(), after.asset().assetId(), "资产审计编号不一致");
        if (decision != null) OaRecordSupport.same(tenantId, decision.getTenantId(), "资产审批审计归属不一致");
        boolean hasApprover = decision != null && decision.getApproverId() != null;
        Long operatorId = hasApprover ? decision.getApproverId() : UserContext.getUserId();
        String operatorName = hasApprover ? decision.getApproverName() : OaRecordSupport.userName();
        if (operatorName == null || operatorName.isBlank()) operatorName = hasApprover ? operatorId.toString() : "system";
        Approval approval = decision == null ? null : new Approval(decision.getProcessInstanceId(), decision.getApprovalResult(),
                decision.getApproverId(), decision.getApproverName(), decision.getApprovalTime());
        String businessType = businessId == null ? "ASSET" : action.businessType;
        Long relatedId = businessId == null ? after.asset().assetId() : businessId;
        SysAuditLogEntity audit = new SysAuditLogEntity();
        audit.setTenantId(tenantId); audit.setBizModule("oa"); audit.setAuditName(action.title); audit.setAuditField(action.name());
        audit.setHighRisk(action.highRisk ? 1 : 0); audit.setRiskLevel(action.highRisk ? "HIGH" : "NORMAL");
        audit.setCreateBy(operatorName.length() <= 64 ? operatorName : String.valueOf(operatorId)); audit.setCreateTime(LocalDateTime.now());
        try {
            audit.setBeforeJson(json.writeValueAsString(new Entry(action.name(), before.asset().assetId(), businessType, relatedId,
                    operatorId, operatorName, UserContext.getUserId(), approval, JobInvocationContext.execution(), before, details)));
            audit.setAfterJson(json.writeValueAsString(new Entry(action.name(), after.asset().assetId(), businessType, relatedId,
                    operatorId, operatorName, UserContext.getUserId(), approval, JobInvocationContext.execution(), after, details)));
        } catch (JsonProcessingException exception) { throw new IllegalStateException("资产审计快照保存失败", exception); }
        OaRecordSupport.saved(mapper.insert(audit));
    }
}
