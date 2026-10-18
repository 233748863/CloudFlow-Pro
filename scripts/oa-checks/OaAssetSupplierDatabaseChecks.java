package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.oa.domain.*;
import com.cloudflow.oa.domain.dto.*;
import com.cloudflow.oa.mapper.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import static com.cloudflow.oa.service.impl.OaOperationsChecks.*;

public final class OaAssetSupplierDatabaseChecks {
    static void run(OaOperationsDatabaseChecks fixture, boolean assetPlanPerformance) throws Exception {
        identity(100000L, 1L); assets(fixture); assetDeletion(fixture); earlySalvage(fixture);
        long maximumNanos = assetPlanPerformance ? OaAssetPlanPerformanceChecks.run(fixture) : 0L;
        OaAssetPlanPersistenceChecks.run(fixture); OaAssetAuditDatabaseChecks.run(fixture); OaAssetJobDatabaseChecks.run(fixture); suppliers(fixture);
        if (assetPlanPerformance) check(maximumNanos < 100_000_000L, "single asset plan generation including persistence is below 100 ms");
    }

    static SysSupplier supplier(OaOperationsDatabaseChecks fixture, String suffix) {
        SysSupplier supplier = new SysSupplier(); supplier.setSupplierName(fixture.marker + suffix); supplier.setSupplierCode(fixture.marker + suffix);
        supplier.setStatus("ACTIVE"); OaRecordSupport.create(supplier, "supplierId"); fixture.mapper(SysSupplierMapper.class).insert(supplier);
        return fixture.mapper(SysSupplierMapper.class).selectById(supplier.getSupplierId());
    }

    static void earlySalvage(OaOperationsDatabaseChecks fixture) {
        OaAssetRegistryService registry = fixture.bean(OaAssetRegistryService.class);
        OaDepreciationService depreciation = fixture.bean(OaDepreciationService.class);
        OaAssetCategory category = new OaAssetCategory(); category.setCategoryCode(fixture.marker + "-early");
        category.setCategoryName("提前到达残值分类"); category.setDefaultUsefulLifeMonths(60);
        category.setDefaultUsefulLifeMonths(1201);
        fails(IllegalArgumentException.class, () -> registry.saveCategory(category), "category cannot supply a life beyond the supported 1200 months");
        equal(0L, fixture.count("SELECT COUNT(*) FROM oa_asset_category WHERE tenant_id=? AND category_code=?", 100000L, category.getCategoryCode()), "invalid category default is not persisted");
        category.setDefaultUsefulLifeMonths(60);
        Long categoryId = registry.saveCategory(category);
        SysAsset input = new SysAsset(); input.setAssetCode(fixture.marker + "-early"); input.setName("提前到达残值资产");
        input.setCategoryId(categoryId); input.setPurchaseAmount(number("10000")); input.setSalvageValue(number("9900"));
        input.setUsefulLifeMonths(60); input.setDepreciationMethod("DOUBLE_DECLINING"); input.setDepreciationFrequency("MONTHLY");
        input.setAvailableFromDate(LocalDate.now().minusYears(1)); input.setDepreciationFlag(1);
        Long assetId = registry.saveAsset(input);
        equal(12, depreciation.postDueAsset(assetId, LocalDate.now()), "first year reaches high salvage value");
        SysAsset completed = registry.detail(assetId);
        decimal("100", completed.getAccumulatedDepreciation(), "early completion posts only depreciable value");
        decimal("9900", completed.getNetBookValue(), "early completion reaches salvage exactly");
        long pending = fixture.count("SELECT COUNT(*) FROM oa_asset_depreciation_schedule WHERE tenant_id=? AND asset_id=? AND status='PLANNED'", 100000L, assetId);
        System.out.println("F1_EARLY_SALVAGE_SQL: completed=" + completed.getDepreciationCompletedFlag() + "; next=" + completed.getNextDepreciationDate() + "; planned=" + pending);
        equal(1, completed.getDepreciationCompletedFlag(), "reaching salvage marks depreciation complete immediately");
        equal(null, completed.getNextDepreciationDate(), "early completion clears next posting date");
        equal(0L, pending, "zero future periods no longer remain pending");
        equal(0, depreciation.postDueAsset(assetId, LocalDate.now().plusYears(10)), "early completion never posts zero future periods");
    }

    static void assets(OaOperationsDatabaseChecks fixture) throws Exception {
        OaAssetRegistryService registry = fixture.bean(OaAssetRegistryService.class); OaDepreciationService depreciation = fixture.bean(OaDepreciationService.class);
        OaAssetCategory category = new OaAssetCategory(); category.setCategoryCode(fixture.marker); category.setCategoryName("验证设备分类"); category.setDefaultUsefulLifeMonths(12);
        category.setDefaultSalvageRate(BigDecimal.ZERO); category.setDefaultDepreciationMethod("STRAIGHT_LINE"); category.setMaintenanceRequiredFlag(1);
        Long categoryId = registry.saveCategory(category);
        SysAsset asset = new SysAsset(); asset.setAssetCode(fixture.marker); asset.setName("数据库验证设备"); asset.setCategoryId(categoryId); asset.setPurchaseAmount(number("1200"));
        asset.setPurchaseDate(LocalDate.now().minusMonths(1)); asset.setAvailableFromDate(LocalDate.now().minusMonths(1)); asset.setDepreciationFlag(1); asset.setSalvageValue(BigDecimal.ZERO);
        Long assetId = registry.saveAsset(asset); depreciation.generatePlan(assetId);
        equal(12L, fixture.count("SELECT COUNT(*) FROM oa_asset_depreciation_schedule WHERE asset_id=?", assetId), "straight-line schedule persisted");
        equal(1, depreciation.postDueAsset(assetId, LocalDate.now()), "first due depreciation posted"); equal(0, depreciation.postDueAsset(assetId, LocalDate.now()), "database posting retry is idempotent");
        decimal("100", registry.detail(assetId).getAccumulatedDepreciation(), "posted balance persisted");
        OaAssetOperationsService operations = fixture.bean(OaAssetOperationsService.class);
        OaAssetRepair repair = new OaAssetRepair(); repair.setAssetId(assetId); repair.setFailureDate(LocalDate.now()); repair.setFaultDescription("更换核心配件延长寿命");
        repair.setRepairCost(number("300")); repair.setCapitalizeFlag(1); repair.setLifeExtensionMonths(12);
        Long repairId = operations.saveRepair(repair); operations.completeRepair(repairId, true, "更换配件并通过检测");
        String reservation = fixture.mapper(OaAssetRepairMapper.class).selectById(repairId).getInstanceId(); equal(true, reservation.startsWith("F:"), "capitalization queues approval");
        AssetRepairApprovalHandler handler = fixture.bean(AssetRepairApprovalHandler.class); ApprovalResultDTO result = fixture.bind(handler, repairId, reservation); handler.handleApproved(result); handler.handleApproved(result);
        decimal("1500", registry.detail(assetId).getPurchaseAmount(), "repair capitalized once"); decimal("100", registry.detail(assetId).getAccumulatedDepreciation(), "repair preserves posted history");
        decimal("100", fixture.jdbc.queryForObject("SELECT depreciation_amount FROM oa_asset_depreciation_schedule WHERE asset_id=? AND status='POSTED'", BigDecimal.class, assetId), "historical period amount immutable");
        equal(24, registry.detail(assetId).getUsefulLifeMonths(), "life extension applied once");
        operations.directMovement(assetId, "ISSUE", 1L, "领取验证设备"); equal("IN_USE", registry.detail(assetId).getStatus(), "issue updates lifecycle state");
        operations.directMovement(assetId, "RETURN", null, "归还验证设备"); equal("IDLE", registry.detail(assetId).getStatus(), "return updates lifecycle state");
        OaAssetMaintenanceService maintenance = fixture.bean(OaAssetMaintenanceService.class);
        OaAssetMaintenancePlan plan = new OaAssetMaintenancePlan(); plan.setAssetId(assetId); plan.setPlanName("周期检测"); plan.setResponsibleId(1L); plan.setNextDueDate(LocalDate.now());
        Long planId = maintenance.savePlan(plan); maintenance.generateTasks(); maintenance.generateTasks();
        equal(1L, fixture.count("SELECT COUNT(*) FROM oa_asset_maintenance_task WHERE plan_id=?", planId), "maintenance generation idempotent");
        OaAssetMaintenanceTask task = maintenance.tasks(assetId).get(0); task.setResult("NORMAL"); task.setCost(number("10")); maintenance.completeTask(task); maintenance.completeTask(task);
        equal(LocalDate.now().plusMonths(1), fixture.mapper(OaAssetMaintenancePlanMapper.class).selectById(planId).getNextDueDate(), "maintenance next date advances once");
        identity(100001L, 1L); fails(IllegalArgumentException.class, () -> registry.detail(assetId), "foreign-tenant asset inaccessible"); identity(100000L, 1L);
    }

    static void assetDeletion(OaOperationsDatabaseChecks fixture) {
        OaAssetRegistryService registry = fixture.bean(OaAssetRegistryService.class);
        OaAssetCategory category = new OaAssetCategory();
        category.setCategoryCode(fixture.marker + "-delete-empty"); category.setCategoryName("删除标记检查分类"); category.setDefaultUsefulLifeMonths(12);
        Long categoryId = registry.saveCategory(category);
        registry.removeCategory(categoryId);
        Integer categoryDeleted = fixture.jdbc.queryForObject("SELECT deleted FROM oa_asset_category WHERE tenant_id=100000 AND category_id=?", Integer.class, categoryId);
        boolean categoryVisible = registry.categories().stream().anyMatch(row -> row.getCategoryId().equals(categoryId));

        OaAssetCategory retained = new OaAssetCategory();
        retained.setCategoryCode(fixture.marker + "-delete-asset"); retained.setCategoryName("资产删除验证分类"); retained.setDefaultUsefulLifeMonths(12);
        Long retainedId = registry.saveCategory(retained);
        SysAsset asset = new SysAsset(); asset.setAssetCode(fixture.marker + "-delete"); asset.setName("未启用折旧的闲置资产");
        asset.setCategoryId(retainedId); asset.setPurchaseAmount(number("100")); asset.setDepreciationFlag(0);
        Long assetId = registry.saveAsset(asset);
        fails(IllegalArgumentException.class, () -> registry.removeCategory(retainedId), "referenced asset category cannot be deleted");
        registry.removeAsset(assetId);
        Integer assetDeleted = fixture.jdbc.queryForObject("SELECT deleted FROM oa_asset WHERE tenant_id=100000 AND asset_id=?", Integer.class, assetId);
        System.out.println("F1_ASSET_DELETE_SQL: category_deleted=" + categoryDeleted + "; category_visible=" + categoryVisible + "; asset_deleted=" + assetDeleted);
        equal(Integer.valueOf(1), categoryDeleted, "asset category logical deletion persisted in actual SQL");
        equal(false, categoryVisible, "removed category excluded from business category list");
        equal(Integer.valueOf(1), assetDeleted, "idle asset logical deletion persisted in actual SQL");
        fails(IllegalArgumentException.class, () -> registry.detail(assetId), "removed asset rejected by business detail query");
        registry.removeCategory(retainedId);
        equal(1L, fixture.count("SELECT COUNT(*) FROM oa_asset_category WHERE category_id=? AND deleted=1", retainedId), "category can be removed after its only asset is removed");
    }

    static void suppliers(OaOperationsDatabaseChecks fixture) throws Exception {
        OaSupplierGovernanceService governance = fixture.bean(OaSupplierGovernanceService.class); SysSupplier supplier = supplier(fixture, "-score");
        LocalDate from = LocalDate.now().minusMonths(1).withDayOfMonth(1), to = from.plusMonths(1).minusDays(1);
        Long pending = governance.ensurePendingScorecard(supplier.getSupplierId(), "MONTHLY", from, to);
        equal(pending, governance.ensurePendingScorecard(supplier.getSupplierId(), "MONTHLY", from, to), "period draft generated once");
        equal(4, governance.criteria(pending).size(), "period job creates all four default criteria");
        for (int index = 0; index < 2; index++) {
            BizPurchaseRequest purchase = new BizPurchaseRequest(); OaRecordSupport.create(purchase, "id"); purchase.setPurchaseNo(fixture.marker + "-source-" + index);
            purchase.setSupplierId(supplier.getSupplierId()); purchase.setUserId(1L); purchase.setExpectedDate(from.plusDays(5).atStartOfDay()); purchase.setStatus("APPROVED"); purchase.setReason("供应商及时率来源验证"); fixture.mapper(BizPurchaseRequestMapper.class).insert(purchase);
            BizPurchaseItem item = new BizPurchaseItem(); item.setTenantId(100000L); item.setPurchaseId(purchase.getId()); item.setConsumableId(1L); item.setConsumableName("测试物料"); item.setQuantity(1); item.setUnitPrice(number("100")); item.setAmount(number("100")); fixture.mapper(BizPurchaseItemMapper.class).insert(item);
            BizPurchaseReceipt receipt = new BizPurchaseReceipt(); receipt.setTenantId(100000L); receipt.setPurchaseId(purchase.getId()); receipt.setItemId(item.getId()); receipt.setConsumableId(1L);
            receipt.setReceivedQuantity(1); receipt.setReceiptTime(from.plusDays(index == 0 ? 4 : 7).atStartOfDay()); fixture.mapper(BizPurchaseReceiptMapper.class).insert(receipt);
        }
        OaSupplierScorecard card = fixture.mapper(OaSupplierScorecardMapper.class).selectById(pending);
        OaSupplierScoreCriteria criterion = new OaSupplierScoreCriteria(); criterion.setCriteriaCode("DELIVERY_ON_TIME"); criterion.setCriteriaName("交付及时率"); criterion.setWeight(BigDecimal.ONE); criterion.setDataSource("AUTO"); criterion.setMaxScore(number("100"));
        SupplierScorecardDTO request = new SupplierScorecardDTO(); request.setScorecard(card); request.setCriteria(List.of(criterion)); governance.saveScorecard(request);
        decimal("50", fixture.mapper(OaSupplierScorecardMapper.class).selectById(pending).getTotalScore(), "AUTO delivery score uses real receipts");
        equal(true, governance.criteria(pending).get(0).getRemark().contains("2笔收货"), "receipt evidence persisted");
        governance.confirmScorecard(pending); equal("ELIMINATED", fixture.mapper(SysSupplierMapper.class).selectById(supplier.getSupplierId()).getStanding(), "confirmed score updates standing");
        fails(ServiceException.class, () -> governance.assertSupplierAllowed(supplier.getSupplierId(), "RFQ"), "eliminated supplier blocked by seeded rule");
        SysSupplier blacklisted = supplier(fixture, "-blacklist"); OaSupplierDecisionService decisions = fixture.bean(OaSupplierDecisionService.class);
        SupplierDecisionDTO decision = new SupplierDecisionDTO(); decision.setAction("BLACKLIST"); decision.setReason("多次违反合同约定，需要经审批限制准入"); decisions.submitDecision(blacklisted.getSupplierId(), decision);
        String reservation = fixture.mapper(SysSupplierMapper.class).selectById(blacklisted.getSupplierId()).getInstanceId(); ApprovalResultDTO result = fixture.bind(decisions, blacklisted.getSupplierId(), reservation);
        result.setVariables(Map.of("action", "BYPASS", "reason", "tampered")); decisions.handleApproved(result); decisions.handleApproved(result);
        equal(1, fixture.mapper(SysSupplierMapper.class).selectById(blacklisted.getSupplierId()).getBlacklistFlag(), "governance callback uses immutable proposal");
        fails(ServiceException.class, () -> governance.assertSupplierAllowed(blacklisted.getSupplierId(), "PURCHASE"), "blacklist blocks purchase");
        identity(100001L, 1L); fails(IllegalArgumentException.class, () -> governance.qualifications(supplier.getSupplierId()), "foreign-tenant supplier inaccessible"); identity(100000L, 1L);
    }
}
