package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.oa.domain.*;
import com.cloudflow.oa.domain.dto.OaApprovalRequest;
import com.cloudflow.oa.domain.vo.OaIdentityReference;
import com.cloudflow.oa.mapper.*;
import com.cloudflow.oa.service.IOaTraceEventService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class OaAssetOperationsService {
    private final SysAssetMapper assetMapper;
    private final SysAssetLogMapper logMapper;
    private final OaAssetRepairMapper repairMapper;
    private final OaAssetMovementMapper movementMapper;
    private final OaDepreciationService depreciation;
    private final OaSupplierGovernanceService suppliers;
    private final IOaTraceEventService trace;
    private final ObjectMapper objectMapper;
    private final OaIdentityReferenceMapper identities;
    private final OaApprovalOutboxService approvals;
    private final com.cloudflow.common.redis.core.SysConfigHelper config;
    private final OaAssetAuditService audit;

    public List<OaAssetRepair> repairs(Long assetId) {
        OaRecordSupport.active(assetMapper.selectById(assetId));
        return repairMapper.selectList(new LambdaQueryWrapper<OaAssetRepair>().eq(OaAssetRepair::getTenantId, OaRecordSupport.tenantId())
                .eq(OaAssetRepair::getAssetId, assetId).eq(OaAssetRepair::getDeleted, 0).orderByDesc(OaAssetRepair::getRepairId));
    }

    public List<OaAssetMovement> movements(Long assetId) {
        OaRecordSupport.active(assetMapper.selectById(assetId));
        return movementMapper.selectList(new LambdaQueryWrapper<OaAssetMovement>().eq(OaAssetMovement::getTenantId, OaRecordSupport.tenantId())
                .eq(OaAssetMovement::getAssetId, assetId).eq(OaAssetMovement::getDeleted, 0).orderByDesc(OaAssetMovement::getMovementId));
    }

    @Transactional(rollbackFor = Exception.class)
    public Long saveRepair(OaAssetRepair repair) {
        SysAsset asset = OaRecordSupport.active(assetMapper.selectForUpdate(repair.getAssetId(), OaRecordSupport.tenantId()));
        if (Set.of("SCRAPPED", "DISPOSED", "LOST").contains(asset.getStatus())) throw new IllegalArgumentException("该资产不能送修");
        repair.setFailureDate(OaRecordSupport.require(repair.getFailureDate(), "故障日期不能为空"));
        repair.setFaultDescription(OaRecordSupport.text(repair.getFaultDescription(), 10000, "故障描述"));
        repair.setRepairCost(OaRecordSupport.decimal(OaRecordSupport.zero(repair.getRepairCost()), 10, 2, false, "维修费用"));
        repair.setDowntimeHours(OaRecordSupport.decimal(OaRecordSupport.zero(repair.getDowntimeHours()), 8, 2, false, "停机小时数"));
        repair.setCapitalizeFlag(OaRecordSupport.flag(repair.getCapitalizeFlag()));
        repair.setLifeExtensionMonths(repair.getLifeExtensionMonths() == null ? 0 : repair.getLifeExtensionMonths());
        if (repair.getLifeExtensionMonths() < 0) throw new IllegalArgumentException("延寿月数不能为负数");
        validateAdjustment(asset, repair);
        if (repair.getSupplierId() != null) suppliers.assertSupplierAllowed(repair.getSupplierId(), "PURCHASE");
        repair.setAssetName(asset.getName());
        OaAssetAuditService.Snapshot before = OaAssetAuditService.repair(asset, null);
        if (repair.getRepairId() == null) {
            OaRecordSupport.create(repair, "repairId"); repair.setRepairNo("WX" + UUID.randomUUID().toString().replace("-", ""));
            repair.setReportBy(UserContext.getUserId()); repair.setRepairStatus("REPORTED"); repair.setCompletionDate(null); repair.setInstanceId(null);
            OaRecordSupport.saved(repairMapper.insert(repair));
        } else {
            OaAssetRepair previous = OaRecordSupport.active(repairMapper.selectForUpdate(repair.getRepairId(), OaRecordSupport.tenantId()));
            OaRecordSupport.same(previous.getAssetId(), repair.getAssetId(), "维修单不能更换资产");
            if (Set.of("COMPLETED", "CANNOT_REPAIR").contains(previous.getRepairStatus())) throw new IllegalArgumentException("已结束维修单不能修改");
            if (previous.getInstanceId() != null && !previous.getInstanceId().isBlank()) throw new IllegalArgumentException("审批中的维修单不能修改");
            before = OaAssetAuditService.repair(asset, previous);
            OaRecordSupport.update(repair, previous); repair.setRepairNo(previous.getRepairNo()); repair.setReportBy(previous.getReportBy()); repair.setInstanceId(previous.getInstanceId()); repair.setCompletionDate(null);
            repair.setRepairStatus(OaRecordSupport.code(repair.getRepairStatus(), previous.getRepairStatus(), Set.of("REPORTED", "DIAGNOSING", "REPAIRING")));
            OaRecordSupport.saved(repairMapper.updateById(repair));
        }
        asset.setStatus("MAINTENANCE"); OaRecordSupport.touch(asset); OaRecordSupport.saved(assetMapper.updateById(asset));
        record(asset.getAssetId(), "REPAIR", repair.getRepairId(), "资产送修", repair.getFaultDescription(), repair);
        audit.record(OaAssetAuditService.Action.REPAIR_SAVED, repair.getRepairId(), before, OaAssetAuditService.repair(asset, repair));
        return repair.getRepairId();
    }

    @Transactional(rollbackFor = Exception.class)
    public void completeRepair(Long id, boolean repairable, String actions) {
        OaAssetRepair reference = OaRecordSupport.active(repairMapper.selectById(id));
        SysAsset asset = OaRecordSupport.active(assetMapper.selectForUpdate(reference.getAssetId(), OaRecordSupport.tenantId()));
        OaAssetRepair repair = OaRecordSupport.active(repairMapper.selectForUpdate(id, OaRecordSupport.tenantId()));
        if (Set.of("COMPLETED", "CANNOT_REPAIR").contains(repair.getRepairStatus())) return;
        if (Set.of("SCRAPPED", "DISPOSED", "LOST").contains(asset.getStatus())) throw new IllegalArgumentException("该资产已终止使用");
        if (repair.getInstanceId() != null && !repair.getInstanceId().isBlank()) throw new IllegalArgumentException("维修审批正在处理");
        if (repairable) validateAdjustment(asset, repair);
        if (repairable && (repair.getRepairCost().compareTo(new BigDecimal(config.getConfigValue("sys.oa.asset.repairApprovalThreshold", "0"))) > 0
                || Integer.valueOf(1).equals(repair.getCapitalizeFlag()) || repair.getLifeExtensionMonths() > 0)) {
            OaAssetAuditService.Snapshot before = OaAssetAuditService.repair(asset, repair);
            java.util.Map<String, Object> values = new java.util.HashMap<>();
            values.put("actions", OaRecordSupport.text(actions, 10000, "维修处理记录")); values.put("repairable", repairable);
            values.put("repairCost", repair.getRepairCost()); values.put("assetName", repair.getAssetName()); values.put("approverIds", approvalUsers());
            repair.setInstanceId(approvals.queue("OA_ASSET_REPAIR", id, repair.getRepairNo(), "oa_asset_repair", values));
            OaRecordSupport.touch(repair); OaRecordSupport.saved(repairMapper.updateById(repair));
            audit.record(OaAssetAuditService.Action.REPAIR_SUBMITTED, id, before, OaAssetAuditService.repair(asset, repair));
            return;
        }
        finishRepair(asset, repair, repairable, actions, null);
    }

    private void validateAdjustment(SysAsset asset, OaAssetRepair repair) {
        if (Integer.valueOf(1).equals(repair.getCapitalizeFlag()) || repair.getLifeExtensionMonths() > 0) {
            OaDepreciationService.validateRepairAdjustment(asset,
                    Integer.valueOf(1).equals(repair.getCapitalizeFlag()) ? repair.getRepairCost() : BigDecimal.ZERO, repair.getLifeExtensionMonths());
        }
    }

    private void finishRepair(SysAsset asset, OaAssetRepair repair, boolean repairable, String actions, ApprovalResultDTO decision) {
        if (Set.of("SCRAPPED", "DISPOSED", "LOST").contains(asset.getStatus())) throw new IllegalArgumentException("该资产已终止使用");
        OaAssetAuditService.Snapshot before = OaAssetAuditService.repair(asset, repair);
        Long id = repair.getRepairId();
        repair.setActionsPerformed(OaRecordSupport.text(actions, 10000, "维修处理记录"));
        repair.setCompletionDate(LocalDate.now()); repair.setRepairStatus(repairable ? "COMPLETED" : "CANNOT_REPAIR");
        if (repairable && (Integer.valueOf(1).equals(repair.getCapitalizeFlag()) || repair.getLifeExtensionMonths() > 0)) {
            depreciation.recalcAfterRepair(asset.getAssetId(), Integer.valueOf(1).equals(repair.getCapitalizeFlag()) ? repair.getRepairCost() : BigDecimal.ZERO,
                    repair.getLifeExtensionMonths(), id, decision);
            asset = OaRecordSupport.active(assetMapper.selectForUpdate(asset.getAssetId(), OaRecordSupport.tenantId()));
        }
        OaRecordSupport.touch(repair); OaRecordSupport.saved(repairMapper.updateById(repair));
        if (repairable && repairMapper.selectCount(new LambdaQueryWrapper<OaAssetRepair>().eq(OaAssetRepair::getAssetId, asset.getAssetId()).eq(OaAssetRepair::getDeleted, 0)
                .in(OaAssetRepair::getRepairStatus, "REPORTED", "DIAGNOSING", "REPAIRING")) == 0) {
            asset.setStatus(asset.getOwnerId() == null ? "IDLE" : "IN_USE"); OaRecordSupport.touch(asset); OaRecordSupport.saved(assetMapper.updateById(asset));
        }
        record(asset.getAssetId(), "REPAIR", id, repairable ? "维修完成" : "无法修复", actions, repair);
        audit.record(OaAssetAuditService.Action.REPAIR_COMPLETED, id, before, OaAssetAuditService.repair(asset, repair),
                java.util.Map.of("repairable", repairable), decision);
    }

    @Transactional(rollbackFor = Exception.class)
    public Long saveMovement(OaAssetMovement movement) {
        SysAsset asset = OaRecordSupport.active(assetMapper.selectForUpdate(movement.getAssetId(), OaRecordSupport.tenantId()));
        if (Set.of("SCRAPPED", "DISPOSED", "LOST").contains(asset.getStatus())) throw new IllegalArgumentException("该资产已终止使用");
        movement.setPurpose(OaRecordSupport.code(movement.getPurpose(), null, Set.of("ISSUE", "RETURN", "TRANSFER", "SCRAP", "DISPOSE", "LOST")));
        movement.setReason(OaRecordSupport.text(movement.getReason(), 500, "调拨原因"));
        movement.setMovementDate(OaRecordSupport.require(movement.getMovementDate(), "调拨日期不能为空"));
        if (Set.of("ISSUE", "TRANSFER").contains(movement.getPurpose())) OaRecordSupport.require(movement.getToCustodianId(), "目标保管人不能为空");
        if (movement.getToCustodianId() != null) {
            OaIdentityReference custodian = OaRecordSupport.require(identities.user(movement.getToCustodianId(), OaRecordSupport.tenantId()), "目标保管人不属于当前租户");
            movement.setToCustodianName(custodian.getName());
        } else movement.setToCustodianName(null);
        if (movement.getToDeptId() != null) OaRecordSupport.require(identities.department(movement.getToDeptId(), OaRecordSupport.tenantId()), "目标部门不属于当前租户");
        OaAssetAuditService.Snapshot before = OaAssetAuditService.movement(asset, null);
        if (movement.getMovementId() == null) {
            OaRecordSupport.create(movement, "movementId"); movement.setMovementNo("DB" + UUID.randomUUID().toString().replace("-", ""));
            movement.setFromCustodianId(asset.getCustodianId()); movement.setFromCustodianName(asset.getCustodianName()); movement.setFromDeptId(asset.getDeptId()); movement.setFromLocation(asset.getLocation());
            movement.setStatus("DRAFT"); movement.setInstanceId(null); OaRecordSupport.saved(movementMapper.insert(movement));
        } else {
            OaAssetMovement previous = OaRecordSupport.active(movementMapper.selectForUpdate(movement.getMovementId(), OaRecordSupport.tenantId()));
            OaRecordSupport.same(previous.getAssetId(), movement.getAssetId(), "调拨单不能更换资产");
            if (!Set.of("DRAFT", "REJECTED").contains(previous.getStatus())) throw new IllegalArgumentException("调拨单当前不可编辑");
            before = OaAssetAuditService.movement(asset, previous);
            OaRecordSupport.update(movement, previous); movement.setMovementNo(previous.getMovementNo()); movement.setStatus("DRAFT"); movement.setInstanceId(previous.getInstanceId());
            movement.setFromCustodianId(asset.getCustodianId()); movement.setFromCustodianName(asset.getCustodianName()); movement.setFromDeptId(asset.getDeptId()); movement.setFromLocation(asset.getLocation());
            OaRecordSupport.saved(movementMapper.updateById(movement));
        }
        audit.record(OaAssetAuditService.Action.MOVEMENT_SAVED, movement.getMovementId(), before, OaAssetAuditService.movement(asset, movement));
        return movement.getMovementId();
    }

    @Transactional(rollbackFor = Exception.class)
    public void executeMovement(Long id) {
        OaAssetMovement reference = OaRecordSupport.active(movementMapper.selectById(id));
        SysAsset asset = OaRecordSupport.active(assetMapper.selectForUpdate(reference.getAssetId(), OaRecordSupport.tenantId()));
        OaAssetMovement movement = OaRecordSupport.active(movementMapper.selectForUpdate(id, OaRecordSupport.tenantId()));
        if ("COMPLETED".equals(movement.getStatus())) return;
        if (Set.of("SCRAPPED", "DISPOSED", "LOST").contains(asset.getStatus())) throw new IllegalArgumentException("该资产已终止使用");
        if (!"DRAFT".equals(movement.getStatus())) throw new IllegalArgumentException("仅草稿调拨单可提交执行");
        if (Set.of("TRANSFER", "SCRAP", "DISPOSE", "LOST").contains(movement.getPurpose())) {
            OaAssetAuditService.Snapshot before = OaAssetAuditService.movement(asset, movement);
            movement.setStatus("APPROVING");
            movement.setInstanceId(approvals.queue("OA_ASSET_MOVEMENT", id, movement.getMovementNo(), "oa_asset_movement",
                    java.util.Map.of("purpose", movement.getPurpose(), "reason", movement.getReason(), "assetName", asset.getName(), "approverIds", approvalUsers())));
            OaRecordSupport.touch(movement); OaRecordSupport.saved(movementMapper.updateById(movement));
            audit.record(OaAssetAuditService.Action.MOVEMENT_SUBMITTED, id, before, OaAssetAuditService.movement(asset, movement));
            return;
        }
        applyMovement(asset, movement, null);
    }

    private void applyMovement(SysAsset asset, OaAssetMovement movement, ApprovalResultDTO decision) {
        Long id = movement.getMovementId();
        if (Set.of("SCRAPPED", "DISPOSED", "LOST").contains(asset.getStatus())) throw new IllegalArgumentException("该资产已终止使用");
        OaRecordSupport.same(movement.getFromCustodianId(), asset.getCustodianId(), "资产保管人已变化，请刷新调拨单");
        OaRecordSupport.same(movement.getFromDeptId(), asset.getDeptId(), "资产所属部门已变化，请刷新调拨单");
        if ("ISSUE".equals(movement.getPurpose()) && !"IDLE".equals(asset.getStatus())) throw new IllegalArgumentException("仅闲置资产可以领用");
        if ("RETURN".equals(movement.getPurpose()) && !"IN_USE".equals(asset.getStatus())) throw new IllegalArgumentException("仅在用资产可以归还");
        OaAssetAuditService.Snapshot before = OaAssetAuditService.movement(asset, movement);
        String status = switch (movement.getPurpose()) { case "ISSUE" -> "IN_USE"; case "RETURN" -> "IDLE"; case "SCRAP" -> "SCRAPPED"; case "DISPOSE" -> "DISPOSED"; case "LOST" -> "LOST"; default -> asset.getStatus(); };
        boolean terminal = Set.of("SCRAPPED", "DISPOSED", "LOST").contains(status);
        if (terminal) {
            depreciation.cancelPending(asset.getAssetId(), decision);
            asset = OaRecordSupport.active(assetMapper.selectForUpdate(asset.getAssetId(), OaRecordSupport.tenantId()));
        }
        if (movement.getToCustodianId() != null) {
            OaIdentityReference custodian = OaRecordSupport.require(identities.user(movement.getToCustodianId(), OaRecordSupport.tenantId()), "目标保管人已失效");
            movement.setToCustodianName(custodian.getName());
        }
        if (movement.getToDeptId() != null) OaRecordSupport.require(identities.department(movement.getToDeptId(), OaRecordSupport.tenantId()), "目标部门已失效");
        asset.setStatus(status); asset.setCustodianId(movement.getToCustodianId()); asset.setCustodianName(movement.getToCustodianName());
        if (movement.getToDeptId() != null) asset.setDeptId(movement.getToDeptId());
        if (movement.getToLocation() != null) asset.setLocation(movement.getToLocation());
        asset.setOwnerId("IN_USE".equals(status) ? movement.getToCustodianId() : null);
        if (terminal) asset.setDisposalDate(movement.getMovementDate());
        OaRecordSupport.touch(asset); OaRecordSupport.saved(assetMapper.updateById(asset));
        assetMapper.update(null, new LambdaUpdateWrapper<SysAsset>().eq(SysAsset::getAssetId, asset.getAssetId()).set(SysAsset::getOwnerId, asset.getOwnerId())
                .set(SysAsset::getCustodianId, asset.getCustodianId()).set(SysAsset::getCustodianName, asset.getCustodianName()));
        movement.setStatus("COMPLETED"); OaRecordSupport.touch(movement); OaRecordSupport.saved(movementMapper.updateById(movement));
        record(asset.getAssetId(), "MOVEMENT", id, "资产" + movement.getPurpose(), movement.getReason(), movement);
        audit.record(OaAssetAuditService.Action.MOVEMENT_EXECUTED, id, before, OaAssetAuditService.movement(asset, movement), java.util.Map.of(), decision);
    }

    @Transactional(rollbackFor = Exception.class)
    public void directMovement(Long assetId, String purpose, Long userId, String reason) {
        OaAssetMovement movement = new OaAssetMovement(); movement.setAssetId(assetId); movement.setPurpose(purpose); movement.setToCustodianId(userId);
        movement.setMovementDate(LocalDate.now()); movement.setReason(reason); Long id = saveMovement(movement); executeMovement(id);
    }

    @Transactional(rollbackFor = Exception.class)
    public void movementDecision(ApprovalResultDTO result, boolean accepted) {
        OaAssetMovement reference = OaRecordSupport.active(movementMapper.selectById(result.getBusinessId()));
        SysAsset asset = OaRecordSupport.active(assetMapper.selectForUpdate(reference.getAssetId(), OaRecordSupport.tenantId()));
        OaAssetMovement movement = OaRecordSupport.active(movementMapper.selectForUpdate(reference.getMovementId(), OaRecordSupport.tenantId()));
        if (!OaApprovalOutboxService.matches(movement.getInstanceId(), result) || !"APPROVING".equals(movement.getStatus())) return;
        OaAssetAuditService.Snapshot before = OaAssetAuditService.movement(asset, movement);
        approvals.snapshot(result);
        if (accepted) applyMovement(asset, movement, result);
        else { movement.setStatus("REJECTED"); OaRecordSupport.touch(movement); OaRecordSupport.saved(movementMapper.updateById(movement)); }
        audit.record(OaAssetAuditService.Action.MOVEMENT_DECIDED, movement.getMovementId(), before,
                OaAssetAuditService.movement(OaRecordSupport.active(assetMapper.selectById(asset.getAssetId())), movement),
                java.util.Map.of("accepted", accepted), result);
    }

    @Transactional(rollbackFor = Exception.class)
    public void repairDecision(ApprovalResultDTO result, boolean accepted) {
        OaAssetRepair reference = OaRecordSupport.active(repairMapper.selectById(result.getBusinessId()));
        SysAsset asset = OaRecordSupport.active(assetMapper.selectForUpdate(reference.getAssetId(), OaRecordSupport.tenantId()));
        OaAssetRepair repair = OaRecordSupport.active(repairMapper.selectForUpdate(reference.getRepairId(), OaRecordSupport.tenantId()));
        if (!OaApprovalOutboxService.matches(repair.getInstanceId(), result) || Set.of("COMPLETED", "CANNOT_REPAIR").contains(repair.getRepairStatus())) return;
        OaAssetAuditService.Snapshot before = OaAssetAuditService.repair(asset, repair);
        OaApprovalRequest request = approvals.snapshot(result);
        if (accepted) finishRepair(asset, repair, Boolean.TRUE.equals(request.getVariables().get("repairable")), request.getVariables().get("actions").toString(), result);
        else OaRecordSupport.saved(repairMapper.update(null, new LambdaUpdateWrapper<OaAssetRepair>().eq(OaAssetRepair::getRepairId, repair.getRepairId())
                .eq(OaAssetRepair::getTenantId, OaRecordSupport.tenantId()).set(OaAssetRepair::getInstanceId, null)
                .set(OaAssetRepair::getUpdateTime, LocalDateTime.now()).set(OaAssetRepair::getUpdateBy, "workflow")));
        audit.record(OaAssetAuditService.Action.REPAIR_DECIDED, repair.getRepairId(), before,
                OaAssetAuditService.repair(OaRecordSupport.active(assetMapper.selectById(asset.getAssetId())), repairMapper.selectById(repair.getRepairId())),
                java.util.Map.of("accepted", accepted), result);
    }

    private List<String> approvalUsers() {
        Long approver = config.getConfigLong("sys.oa.asset.approverUserId", 1L);
        OaRecordSupport.require(identities.user(approver, OaRecordSupport.tenantId()), "资产审批人未正确配置");
        return List.of(approver.toString());
    }

    private void record(Long assetId, String relatedType, Long relatedId, String title, String content, Object snapshot) {
        SysAssetLog log = new SysAssetLog(); log.setTenantId(OaRecordSupport.tenantId()); log.setRefId(assetId); log.setRefType("1"); log.setType(title);
        log.setQuantityChange(0); log.setOperatorId(UserContext.getUserId()); log.setRemark(content); log.setCreateTime(LocalDateTime.now()); OaRecordSupport.saved(logMapper.insert(log));
        try { trace.record(OaRecordSupport.tenantId(), "ASSET", assetId, relatedType, relatedId, relatedType, title, content, UserContext.getUserId(), OaRecordSupport.userName(), objectMapper.writeValueAsString(snapshot)); }
        catch (JsonProcessingException exception) { throw new IllegalStateException("资产时间线快照保存失败", exception); }
    }
}
