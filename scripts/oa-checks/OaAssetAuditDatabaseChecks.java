package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.oa.domain.OaAssetMovement;
import com.cloudflow.oa.domain.OaAssetRepair;
import com.cloudflow.oa.domain.SysAsset;
import com.cloudflow.oa.mapper.SysAssetMapper;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.dao.DataAccessException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static com.cloudflow.oa.service.impl.OaOperationsChecks.*;

final class OaAssetAuditDatabaseChecks {
    private OaAssetAuditDatabaseChecks() { }

    static void run(OaOperationsDatabaseChecks fixture) throws Exception {
        identity(100000L, 1L);
        OaDepreciationService depreciation = fixture.bean(OaDepreciationService.class);
        OaAssetOperationsService operations = fixture.bean(OaAssetOperationsService.class);
        SysAsset input = asset("STRAIGHT_LINE"); input.setName("资产审计事务检查"); input.setAssetCode(fixture.marker + "-audit");
        input.setPurchaseAmount(number("1200")); input.setSalvageValue(BigDecimal.ZERO); input.setNetBookValue(number("1200"));
        input.setUsefulLifeMonths(12); input.setDepreciationFrequency("MONTHLY"); input.setAvailableFromDate(LocalDate.now().minusMonths(1));
        OaRecordSupport.create(input, "assetId"); fixture.mapper(SysAssetMapper.class).insert(input);
        Long assetId = input.getAssetId();

        rollback(fixture, assetId, OaAssetAuditService.Action.PLAN_GENERATED, () -> depreciation.generatePlan(assetId));
        depreciation.generatePlan(assetId);
        rollback(fixture, assetId, OaAssetAuditService.Action.DEPRECIATION_POSTED, () -> depreciation.postDueAsset(assetId, LocalDate.now()));
        equal(1, depreciation.postDueAsset(assetId, LocalDate.now()), "audit retry posts the due period once");
        equal(0, depreciation.postDueAsset(assetId, LocalDate.now()), "posted period retry changes no audit");
        equal(1L, auditCount(fixture, assetId, "DEPRECIATION_POSTED"), "one posting audit for one successful operation");
        JsonNode postedBefore = audit(fixture, assetId, "DEPRECIATION_POSTED", true);
        JsonNode postedAfter = audit(fixture, assetId, "DEPRECIATION_POSTED", false);
        decimal("0", postedBefore.at("/state/asset/accumulatedDepreciation").decimalValue(), "posting audit retains original balance");
        decimal("100", postedAfter.at("/state/asset/accumulatedDepreciation").decimalValue(), "posting audit retains actual posted balance");
        equal(1L, postedAfter.path("operatorId").asLong(), "posting audit retains requesting actor");
        equal(1, postedAfter.at("/details/postedPeriods").asInt(), "posting audit retains affected period count");

        OaAssetRepair repair = new OaAssetRepair(); repair.setAssetId(assetId); repair.setFailureDate(LocalDate.now());
        repair.setFaultDescription("审计检查更换配件并延寿"); repair.setRepairCost(number("300")); repair.setCapitalizeFlag(1); repair.setLifeExtensionMonths(12);
        Long repairId = operations.saveRepair(repair);
        rollback(fixture, assetId, OaAssetAuditService.Action.REPAIR_SUBMITTED, () -> operations.completeRepair(repairId, true, "验收通过"));
        operations.completeRepair(repairId, true, "验收通过");
        AssetRepairApprovalHandler repairHandler = fixture.bean(AssetRepairApprovalHandler.class);
        ApprovalResultDTO approved = fixture.bind(repairHandler, repairId, operations.repairs(assetId).get(0).getInstanceId());
        decision(approved, "APPROVED");
        approved.setVariables(Map.of("password", "owned-untrusted-approval-variable"));
        UserContext.setUserName("workflow"); UserContext.setUserId(0L);
        rollback(fixture, assetId, OaAssetAuditService.Action.REPAIR_ADJUSTED, () -> repairHandler.handleApproved(approved));
        rollback(fixture, assetId, OaAssetAuditService.Action.REPAIR_COMPLETED, () -> repairHandler.handleApproved(approved));
        rollback(fixture, assetId, OaAssetAuditService.Action.REPAIR_DECIDED, () -> repairHandler.handleApproved(approved));
        repairHandler.handleApproved(approved); repairHandler.handleApproved(approved);
        operations.completeRepair(repairId, true, "重复办理已完成维修");
        equal(1L, auditCount(fixture, assetId, "REPAIR_ADJUSTED"), "capitalization and extension retry keeps one audit");
        equal(1L, auditCount(fixture, assetId, "REPAIR_COMPLETED"), "completed repair retry keeps one audit");
        equal(1L, auditCount(fixture, assetId, "REPAIR_DECIDED"), "approval replay keeps one decision audit");
        JsonNode adjustedBefore = audit(fixture, assetId, "REPAIR_ADJUSTED", true);
        JsonNode adjustedAfter = audit(fixture, assetId, "REPAIR_ADJUSTED", false);
        decimal("1200", adjustedBefore.at("/state/asset/purchaseAmount").decimalValue(), "capitalization audit retains original cost");
        decimal("1500", adjustedAfter.at("/state/asset/purchaseAmount").decimalValue(), "capitalization audit retains approved cost");
        equal(12, adjustedBefore.at("/state/asset/usefulLifeMonths").asInt(), "extension audit retains original life");
        equal(24, adjustedAfter.at("/state/asset/usefulLifeMonths").asInt(), "extension audit retains approved life");
        equal(repairId.longValue(), adjustedAfter.path("businessId").asLong(), "capitalization audit references exact repair");
        equal(2L, adjustedAfter.path("operatorId").asLong(), "callback audit retains actual approver, independent of executor");
        equal(0L, adjustedAfter.path("executorId").asLong(), "callback audit separately retains system executor");
        equal(approved.getProcessInstanceId(), adjustedAfter.at("/approval/processInstanceId").asText(), "audit binds actual approval instance");
        equal(approved.getApprovalTime().longValue(), adjustedAfter.at("/approval/approvalTime").asLong(), "audit retains approval time");
        equal("APPROVED", adjustedAfter.at("/approval/result").asText(), "audit retains approval outcome");
        equal("数据库审批人", fixture.jdbc.queryForObject("SELECT create_by FROM sys_audit_log WHERE tenant_id=100000 AND audit_field='REPAIR_ADJUSTED' "
                + "AND JSON_UNQUOTE(JSON_EXTRACT(after_json,'$.assetId'))=?", String.class, assetId.toString()), "audit display identifies real approver");

        identity(100000L, 1L);
        OaAssetRepair rejectedRepair = new OaAssetRepair(); rejectedRepair.setAssetId(assetId); rejectedRepair.setFailureDate(LocalDate.now());
        rejectedRepair.setFaultDescription("拒绝费用调整"); rejectedRepair.setRepairCost(number("200")); rejectedRepair.setCapitalizeFlag(1);
        Long rejectedId = operations.saveRepair(rejectedRepair); operations.completeRepair(rejectedId, true, "等待审核");
        ApprovalResultDTO rejected = fixture.bind(repairHandler, rejectedId, operations.repairs(assetId).get(0).getInstanceId()); decision(rejected, "REJECTED");
        rollback(fixture, assetId, OaAssetAuditService.Action.REPAIR_DECIDED, () -> repairHandler.handleRejected(rejected));
        repairHandler.handleRejected(rejected); repairHandler.handleRejected(rejected);
        equal(2L, auditCount(fixture, assetId, "REPAIR_DECIDED"), "rejected callback audit recorded once alongside approved callback");
        JsonNode rejectedAfter = audit(fixture, assetId, "REPAIR_DECIDED", false);
        equal("REJECTED", rejectedAfter.at("/approval/result").asText(), "rejected decision retained");
        check(rejectedAfter.at("/state/repair/instanceId").isNull(), "rejection audit reflects cleared approval instance");
        decimal("1500", rejectedAfter.at("/state/asset/purchaseAmount").decimalValue(), "rejection audit retains approved asset value");
        operations.completeRepair(rejectedId, false, "取消维修");
        // 完成无法修复的维修保持维修状态；调拨报废允许从该状态进入终态。
        OaAssetMovement movement = new OaAssetMovement(); movement.setAssetId(assetId); movement.setPurpose("SCRAP");
        movement.setMovementDate(LocalDate.now()); movement.setReason("审计检查报废");
        Long movementId = operations.saveMovement(movement);
        rollback(fixture, assetId, OaAssetAuditService.Action.MOVEMENT_SUBMITTED, () -> operations.executeMovement(movementId));
        operations.executeMovement(movementId);
        AssetMovementApprovalHandler movementHandler = fixture.bean(AssetMovementApprovalHandler.class);
        ApprovalResultDTO scrapped = fixture.bind(movementHandler, movementId, operations.movements(assetId).get(0).getInstanceId()); decision(scrapped, "APPROVED");
        rollback(fixture, assetId, OaAssetAuditService.Action.DEPRECIATION_CANCELLED, () -> movementHandler.handleApproved(scrapped));
        rollback(fixture, assetId, OaAssetAuditService.Action.MOVEMENT_EXECUTED, () -> movementHandler.handleApproved(scrapped));
        rollback(fixture, assetId, OaAssetAuditService.Action.MOVEMENT_DECIDED, () -> movementHandler.handleApproved(scrapped));
        movementHandler.handleApproved(scrapped); movementHandler.handleApproved(scrapped); operations.executeMovement(movementId);
        depreciation.cancelPending(assetId);
        equal(1L, auditCount(fixture, assetId, "DEPRECIATION_CANCELLED"), "cancellation retry keeps one audit");
        equal(1L, auditCount(fixture, assetId, "MOVEMENT_EXECUTED"), "movement execution retry keeps one audit");
        equal(1L, auditCount(fixture, assetId, "MOVEMENT_DECIDED"), "movement approval replay keeps one audit");
        JsonNode movedBefore = audit(fixture, assetId, "MOVEMENT_EXECUTED", true);
        JsonNode movedAfter = audit(fixture, assetId, "MOVEMENT_EXECUTED", false);
        equal("MAINTENANCE", movedBefore.at("/state/asset/status").asText(), "movement audit retains original state");
        equal("SCRAPPED", movedAfter.at("/state/asset/status").asText(), "movement audit retains terminal state");
        equal(movementId.longValue(), movedAfter.path("businessId").asLong(), "movement audit references actual document");
        equal(0L, fixture.count("SELECT COUNT(*) FROM sys_audit_log WHERE tenant_id=100000 AND JSON_UNQUOTE(JSON_EXTRACT(after_json,'$.assetId'))=? "
                + "AND (before_json IS NULL OR after_json IS NULL OR create_by='' OR create_time IS NULL)", assetId.toString()), "every asset audit includes both snapshots and actor");
        equal(0L, fixture.count("SELECT COUNT(*) FROM sys_audit_log WHERE tenant_id=100000 AND JSON_UNQUOTE(JSON_EXTRACT(after_json,'$.assetId'))=? "
                + "AND (before_json LIKE '%owned-untrusted-approval-variable%' OR after_json LIKE '%owned-untrusted-approval-variable%')", assetId.toString()), "approval variables never enter audit snapshots");
        long retained = auditCount(fixture, assetId, "DEPRECIATION_POSTED");
        identity(100001L, 1L);
        try { fails(IllegalArgumentException.class, () -> depreciation.postDueAsset(assetId, LocalDate.now()), "cross-tenant posting rejected before audit"); }
        finally { identity(100000L, 1L); }
        equal(retained, auditCount(fixture, assetId, "DEPRECIATION_POSTED"), "cross-tenant request does not add target audit");
        System.out.println("F1_ASSET_AUDIT: actualDatabase=true; sharedTransactions=true; rollbackCases=11; replay=true; approver=true; beforeAfter=true; fixedFields=true");
    }

    private static void decision(ApprovalResultDTO result, String outcome) {
        result.setApprovalResult(outcome); result.setApproverId(2L); result.setApproverName("数据库审批人"); result.setApprovalTime(System.currentTimeMillis());
    }

    private static long auditCount(OaOperationsDatabaseChecks fixture, Long assetId, String action) {
        return fixture.count("SELECT COUNT(*) FROM sys_audit_log WHERE tenant_id=100000 AND audit_field=? AND JSON_UNQUOTE(JSON_EXTRACT(after_json,'$.assetId'))=?", action, assetId.toString());
    }

    private static JsonNode audit(OaOperationsDatabaseChecks fixture, Long assetId, String action, boolean before) throws Exception {
        String column = before ? "before_json" : "after_json";
        String value = fixture.jdbc.queryForObject("SELECT " + column + " FROM sys_audit_log WHERE tenant_id=100000 AND audit_field=? "
                + "AND JSON_UNQUOTE(JSON_EXTRACT(after_json,'$.assetId'))=? ORDER BY audit_id DESC LIMIT 1", String.class, action, assetId.toString());
        return fixture.json.readTree(value);
    }

    private static List<Object> business(OaOperationsDatabaseChecks fixture, Long assetId) {
        return List.of(fixture.jdbc.queryForMap("SELECT * FROM oa_asset WHERE tenant_id=100000 AND asset_id=?", assetId),
                fixture.jdbc.queryForList("SELECT * FROM oa_asset_depreciation_schedule WHERE tenant_id=100000 AND asset_id=? ORDER BY schedule_id", assetId),
                fixture.jdbc.queryForList("SELECT * FROM oa_asset_repair WHERE tenant_id=100000 AND asset_id=? ORDER BY repair_id", assetId),
                fixture.jdbc.queryForList("SELECT * FROM oa_asset_movement WHERE tenant_id=100000 AND asset_id=? ORDER BY movement_id", assetId),
                fixture.jdbc.queryForList("SELECT * FROM oa_asset_log WHERE tenant_id=100000 AND ref_id=? AND ref_type='1' ORDER BY log_id", assetId),
                fixture.jdbc.queryForList("SELECT * FROM oa_trace_event WHERE tenant_id=100000 AND business_type='ASSET' AND business_id=? ORDER BY id", assetId),
                fixture.jdbc.queryForList("SELECT * FROM outbox_event WHERE tenant_id=100000 ORDER BY id"),
                fixture.jdbc.queryForList("SELECT * FROM sys_audit_log WHERE tenant_id=100000 AND JSON_UNQUOTE(JSON_EXTRACT(after_json,'$.assetId'))=? ORDER BY audit_id", assetId.toString()));
    }

    private static void rollback(OaOperationsDatabaseChecks fixture, Long assetId, OaAssetAuditService.Action action, Runnable operation) {
        List<Object> before = business(fixture, assetId);
        fixture.jdbc.execute("CREATE TRIGGER f1_asset_owned_audit_failure BEFORE INSERT ON sys_audit_log FOR EACH ROW BEGIN "
                + "IF NEW.tenant_id=100000 AND NEW.audit_field='" + action.name() + "' AND JSON_UNQUOTE(JSON_EXTRACT(NEW.after_json,'$.assetId'))='" + assetId
                + "' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='owned asset audit rollback check'; END IF; END");
        try {
            fails(DataAccessException.class, operation, "actual audit failure rejects " + action);
            equal(before, business(fixture, assetId), "audit failure rolls back asset, periods, documents, timeline, outbox and earlier audits: " + action);
        } finally { fixture.jdbc.execute("DROP TRIGGER f1_asset_owned_audit_failure"); }
    }
}
