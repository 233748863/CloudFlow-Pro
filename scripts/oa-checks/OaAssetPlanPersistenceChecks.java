package com.cloudflow.oa.service.impl;

import com.cloudflow.oa.domain.SysAsset;
import com.cloudflow.oa.domain.OaAssetRepair;
import com.cloudflow.oa.domain.OaAssetMovement;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.oa.mapper.SysAssetMapper;
import java.math.BigDecimal;
import java.time.LocalDate;
import org.springframework.dao.DataAccessException;

import static com.cloudflow.oa.service.impl.OaOperationsChecks.*;

final class OaAssetPlanPersistenceChecks {
    private OaAssetPlanPersistenceChecks() { }

    static void run(OaOperationsDatabaseChecks fixture) throws Exception {
        OaDepreciationService depreciation = fixture.bean(OaDepreciationService.class);
        SysAsset input = asset("STRAIGHT_LINE");
        input.setName("批量计划事务验证"); input.setAssetCode(fixture.marker + "-batch");
        input.setUsefulLifeMonths(1200); input.setDepreciationFrequency("MONTHLY");
        OaRecordSupport.create(input, "assetId"); fixture.mapper(SysAssetMapper.class).insert(input);
        Long assetId = input.getAssetId();
        // 在后续期次强制数据库拒绝，确认前面已写入的批次与资产余额一起回滚。
        fixture.jdbc.execute("CREATE TRIGGER f1_plan_owned_failure BEFORE INSERT ON oa_asset_depreciation_schedule FOR EACH ROW "
                + "BEGIN IF NEW.asset_id=" + assetId + " AND NEW.tenant_id=100000 AND NEW.period_no=401 "
                + "THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='owned plan persistence check'; END IF; END");
        try {
            fails(DataAccessException.class, () -> depreciation.generatePlan(assetId), "failure in a later plan batch rejects generation");
            equal(0L, fixture.count("SELECT COUNT(*) FROM oa_asset_depreciation_schedule WHERE asset_id=?", assetId), "all earlier plan batches roll back");
            equal(0L, fixture.count("SELECT COUNT(*) FROM oa_asset WHERE asset_id=? AND (version<>0 OR next_depreciation_date IS NOT NULL)", assetId), "failed plan leaves asset state unchanged");
        } finally {
            fixture.jdbc.execute("DROP TRIGGER f1_plan_owned_failure");
        }
        identity(100001L, 1L);
        try { fails(IllegalArgumentException.class, () -> depreciation.generatePlan(assetId), "foreign tenant cannot create a plan for another tenant's asset"); }
        finally { identity(100000L, 1L); }
        equal(0L, fixture.count("SELECT COUNT(*) FROM oa_asset_depreciation_schedule WHERE asset_id=?", assetId), "cross-tenant rejection writes no period");
        depreciation.generatePlan(assetId);
        equal(1200L, fixture.count("SELECT COUNT(*) FROM oa_asset_depreciation_schedule WHERE tenant_id=100000 AND asset_id=?", assetId), "retry persists all 1200 periods");
        equal(0L, fixture.count("SELECT COUNT(*) FROM oa_asset_depreciation_schedule WHERE asset_id=? AND "
                + "(tenant_id<>100000 OR status<>'PLANNED' OR version<>0 OR create_by<>'batch-f-check' OR update_by<>'batch-f-check' "
                + "OR create_time IS NULL OR update_time IS NULL OR post_time IS NOT NULL OR post_by IS NOT NULL)", assetId), "new periods retain tenant, version and complete creation audit");
        decimal("9000", fixture.jdbc.queryForObject("SELECT SUM(depreciation_amount) FROM oa_asset_depreciation_schedule WHERE asset_id=?", BigDecimal.class, assetId), "all inserted batches balance to original value minus salvage");
        equal(LocalDate.of(2020, 2, 1), fixture.mapper(SysAssetMapper.class).selectById(assetId).getNextDepreciationDate(), "asset points to first actual persisted period");
        System.out.println("F1_PLAN_PERSISTENCE: periods=1200; rollback=true; retry=true; tenantIsolation=true; audit=true");
        updateRollback(fixture, assetId);
        repairLimits(fixture, assetId);
        terminalRepairs(fixture);
    }

    private static void updateRollback(OaOperationsDatabaseChecks fixture, Long assetId) {
        OaDepreciationService depreciation = fixture.bean(OaDepreciationService.class);
        SysAsset revised = fixture.mapper(SysAssetMapper.class).selectById(assetId);
        revised.setUsefulLifeMonths(60); OaRecordSupport.saved(fixture.mapper(SysAssetMapper.class).updateById(revised));
        Integer originalVersion = revised.getVersion();
        fixture.jdbc.execute("CREATE TRIGGER f1_plan_owned_update_failure BEFORE UPDATE ON oa_asset_depreciation_schedule FOR EACH ROW "
                + "BEGIN IF NEW.asset_id=" + assetId + " AND NEW.tenant_id=100000 AND NEW.period_no=401 "
                + "THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='owned plan update check'; END IF; END");
        try {
            fails(DataAccessException.class, () -> depreciation.generatePlan(assetId), "failure in a later update batch rolls back revised and cancelled periods");
            equal(1200L, fixture.count("SELECT COUNT(*) FROM oa_asset_depreciation_schedule WHERE asset_id=? AND status='PLANNED' AND version=0 AND depreciation_amount=7.50", assetId), "all earlier updates and cancellations roll back");
            equal(originalVersion, fixture.mapper(SysAssetMapper.class).selectById(assetId).getVersion(), "failed regeneration leaves asset version unchanged");
        } finally { fixture.jdbc.execute("DROP TRIGGER f1_plan_owned_update_failure"); }
        depreciation.generatePlan(assetId);
        equal(60L, fixture.count("SELECT COUNT(*) FROM oa_asset_depreciation_schedule WHERE asset_id=? AND status='PLANNED' AND version=1 AND depreciation_amount=150", assetId), "shorter life changes exactly 60 planned periods");
        equal(1140L, fixture.count("SELECT COUNT(*) FROM oa_asset_depreciation_schedule WHERE asset_id=? AND status='CANCELLED' AND version=1", assetId), "shorter life cancels remaining periods with version checks");
        revised = fixture.mapper(SysAssetMapper.class).selectById(assetId);
        revised.setUsefulLifeMonths(1200); OaRecordSupport.saved(fixture.mapper(SysAssetMapper.class).updateById(revised));
        depreciation.generatePlan(assetId);
        equal(1200L, fixture.count("SELECT COUNT(*) FROM oa_asset_depreciation_schedule WHERE asset_id=? AND status='PLANNED' AND version=2 AND depreciation_amount=7.50", assetId), "extended plan restores existing periods once");
        equal(0L, fixture.count("SELECT COUNT(*) FROM oa_asset_depreciation_schedule WHERE asset_id=? AND (create_by<>'batch-f-check' OR create_time IS NULL OR create_time>update_time)", assetId), "regeneration retains creation audit fields");
        depreciation.generatePlan(assetId);
        equal(1200L, fixture.count("SELECT COUNT(*) FROM oa_asset_depreciation_schedule WHERE asset_id=? AND version=2", assetId), "identical regeneration does not rewrite periods");
        System.out.println("F1_PLAN_UPDATE_PERSISTENCE: periods=1200; rollback=true; cancellation=true; restoration=true; unchangedPeriodsKept=true");
    }

    private static void repairLimits(OaOperationsDatabaseChecks fixture, Long assetId) {
        OaAssetOperationsService operations = fixture.bean(OaAssetOperationsService.class);
        for (int extension : new int[] {1, Integer.MAX_VALUE}) {
            OaAssetRepair repair = new OaAssetRepair(); repair.setAssetId(assetId); repair.setFailureDate(LocalDate.now());
            repair.setFaultDescription("寿命上限输入"); repair.setLifeExtensionMonths(extension);
            boolean rejected = false;
            try { operations.saveRepair(repair); }
            catch (IllegalArgumentException exception) { rejected = true; }
            System.out.println("F1_REPAIR_LIFE_LIMIT: currentMonths=1200; extension=" + extension + "; rejected=" + rejected);
            check(rejected, "repair registration rejects a lifespan beyond 1200 months before changing asset state");
        }
        OaAssetRepair excessiveCost = new OaAssetRepair(); excessiveCost.setAssetId(assetId); excessiveCost.setFailureDate(LocalDate.now());
        excessiveCost.setFaultDescription("资本化金额上限输入"); excessiveCost.setCapitalizeFlag(1); excessiveCost.setRepairCost(number("99999999.99"));
        fails(IllegalArgumentException.class, () -> operations.saveRepair(excessiveCost), "repair registration rejects an overflowing capitalized asset value");
        equal(0L, fixture.count("SELECT COUNT(*) FROM oa_asset_repair WHERE tenant_id=100000 AND asset_id=?", assetId), "invalid adjustments do not create repairs");
        equal("IDLE", fixture.mapper(SysAssetMapper.class).selectById(assetId).getStatus(), "invalid adjustments do not move the asset into maintenance");
    }

    private static void terminalRepairs(OaOperationsDatabaseChecks fixture) throws Exception {
        OaAssetOperationsService operations = fixture.bean(OaAssetOperationsService.class);
        OaDepreciationService depreciation = fixture.bean(OaDepreciationService.class);
        int scenario = 0;
        for (String purpose : new String[] {"SCRAP", "DISPOSE", "LOST", "SCRAP"}) {
            boolean lateApproval = scenario == 3;
            SysAsset input = asset("STRAIGHT_LINE"); input.setName("终态维修保护"); input.setAssetCode(fixture.marker + "-terminal-repair-" + scenario++);
            OaRecordSupport.create(input, "assetId"); fixture.mapper(SysAssetMapper.class).insert(input);
            Long assetId = input.getAssetId(); depreciation.generatePlan(assetId);
            OaAssetRepair repair = new OaAssetRepair(); repair.setAssetId(assetId); repair.setFailureDate(LocalDate.now()); repair.setFaultDescription("终态前未结束维修");
            if (lateApproval) { repair.setCapitalizeFlag(1); repair.setRepairCost(number("300")); repair.setLifeExtensionMonths(12); }
            Long repairId = operations.saveRepair(repair);
            ApprovalResultDTO repairDecision = null;
            if (lateApproval) {
                operations.completeRepair(repairId, true, "待审批的资本化维修");
                OaAssetRepair submitted = operations.repairs(assetId).get(0);
                repairDecision = fixture.bind(fixture.bean(AssetRepairApprovalHandler.class), repairId, submitted.getInstanceId());
            }
            OaAssetMovement staleDraft = new OaAssetMovement(); staleDraft.setAssetId(assetId); staleDraft.setPurpose("SCRAP");
            staleDraft.setMovementDate(LocalDate.now()); staleDraft.setReason("终态前未提交的调拨草稿");
            Long staleDraftId = operations.saveMovement(staleDraft);
            operations.directMovement(assetId, purpose, null, "维修尚未结束时终止使用");
            OaAssetMovement movement = operations.movements(assetId).get(0);
            AssetMovementApprovalHandler movementHandler = fixture.bean(AssetMovementApprovalHandler.class);
            movementHandler.handleApproved(fixture.bind(movementHandler, movement.getMovementId(), movement.getInstanceId()));
            String expected = "SCRAP".equals(purpose) ? "SCRAPPED" : "DISPOSE".equals(purpose) ? "DISPOSED" : "LOST";
            equal(expected, fixture.mapper(SysAssetMapper.class).selectById(assetId).getStatus(), "actual movement callback ends asset use");
            try {
                if (lateApproval) fixture.bean(AssetRepairApprovalHandler.class).handleApproved(repairDecision);
                else operations.completeRepair(repairId, true, "终态后尝试完成旧维修");
            } catch (IllegalArgumentException exception) { /* Explicit business rejection is allowed. */ }
            SysAsset after = fixture.mapper(SysAssetMapper.class).selectById(assetId);
            System.out.println("F1_TERMINAL_REPAIR: purpose=" + purpose + "; lateApproval=" + lateApproval + "; actualStatus=" + after.getStatus());
            equal(expected, after.getStatus(), "old repair completion never reactivates a terminal asset");
            decimal("10000", after.getPurchaseAmount(), "late repair does not capitalize a terminal asset");
            equal(null, after.getNextDepreciationDate(), "late repair cannot restore next depreciation date");
            equal(0L, fixture.count("SELECT COUNT(*) FROM oa_asset_depreciation_schedule WHERE asset_id=? AND status='PLANNED'", assetId), "late repair cannot restore cancelled depreciation");
            OaAssetMovement invalidDraft = new OaAssetMovement(); invalidDraft.setAssetId(assetId); invalidDraft.setPurpose("SCRAP");
            invalidDraft.setMovementDate(LocalDate.now()); invalidDraft.setReason("终态后尝试再次调拨");
            long movementCount = fixture.count("SELECT COUNT(*) FROM oa_asset_movement WHERE tenant_id=100000 AND asset_id=?", assetId);
            fails(IllegalArgumentException.class, () -> operations.saveMovement(invalidDraft), "terminal asset rejects new movement drafts");
            equal(movementCount, fixture.count("SELECT COUNT(*) FROM oa_asset_movement WHERE tenant_id=100000 AND asset_id=?", assetId), "rejected terminal movement adds no draft");
            fails(IllegalArgumentException.class, () -> operations.executeMovement(staleDraftId), "terminal asset rejects submitting old movement drafts");
            equal(1L, fixture.count("SELECT COUNT(*) FROM oa_asset_movement WHERE tenant_id=100000 AND movement_id=? AND status='DRAFT' AND instance_id IS NULL", staleDraftId), "old terminal draft remains unsubmitted without approval instance");
            System.out.println("F1_TERMINAL_MOVEMENT: purpose=" + purpose + "; newDraftRejected=true; staleDraftRejected=true");
        }
    }
}
