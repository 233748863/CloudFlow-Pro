package com.cloudflow.oa.service.impl;

import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.sensitive.config.SensitiveBeanSerializerModifier;
import com.cloudflow.oa.domain.OaSupplierCategory;
import com.cloudflow.oa.domain.OaSupplierQualification;
import com.cloudflow.oa.domain.OaSupplierScoreCriteria;
import com.cloudflow.oa.domain.OaSupplierScorecard;
import com.cloudflow.oa.domain.SysSupplier;
import com.cloudflow.oa.domain.dto.SupplierScorecardDTO;
import com.cloudflow.oa.mapper.OaSupplierQualificationMapper;
import com.cloudflow.oa.mapper.OaSupplierScoreCriteriaMapper;
import com.cloudflow.oa.mapper.OaSupplierScorecardMapper;
import com.cloudflow.oa.mapper.SysSupplierMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.module.SimpleModule;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Real SQL checks using the production tenant, logical-deletion and transaction plugins. */
public final class OaSupplierGovernanceDatabaseChecks {
    private static int assertions;
    private static int supplierSequence;
    private static final List<Map<String, Object>> outcomes = new ArrayList<>();

    private OaSupplierGovernanceDatabaseChecks() { }

    @FunctionalInterface
    private interface Scenario { void run(OaOperationsDatabaseChecks fixture) throws Exception; }

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 2) throw new IllegalArgumentException("An isolated JDBC URL and output JSON path are required");
        StpLogic previous = StpUtil.getStpLogic();
        OaOperationsDatabaseChecks fixture = null;
        try {
            OaOperationsChecks.identity(100000L, 1L);
            fixture = new OaOperationsDatabaseChecks(arguments[0], false);
            scenario(fixture, "supplier-removal", OaSupplierGovernanceDatabaseChecks::supplierRemoval);
            scenario(fixture, "supplier-private-field-roundtrip", OaSupplierGovernanceDatabaseChecks::supplierPrivateFieldRoundtrip);
            scenario(fixture, "category-tree-and-removal", OaSupplierGovernanceDatabaseChecks::categoryRemoval);
            scenario(fixture, "qualification-reset-and-long-term", OaSupplierGovernanceDatabaseChecks::qualificationUpdates);
            scenario(fixture, "score-dimension-removal-and-restoration", OaSupplierGovernanceDatabaseChecks::scoreDimensions);
            scenario(fixture, "score-bands-and-confirmation", OaSupplierGovernanceDatabaseChecks::scoreBands);
            scenario(fixture, "critical-qualification-admission", OaSupplierGovernanceDatabaseChecks::criticalQualifications);
            scenario(fixture, "expiry-scan-retired-supplier", OaSupplierGovernanceDatabaseChecks::expiryScan);
            boolean passed = outcomes.stream().allMatch(row -> Boolean.TRUE.equals(row.get("passed")));
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("passed", passed); result.put("assertions", assertions); result.put("scenarios", outcomes);
            result.put("actualDatabase", true); result.put("productionTenantPlugins", true);
            result.put("actualApplicationHttp", false); result.put("actualWorkflowExecution", false);
            result.put("remoteRulesFromDatabaseFixture", true); result.put("allF2AcceptanceComplete", false);
            Files.writeString(Path.of(arguments[1]), fixture.json.writerWithDefaultPrettyPrinter().writeValueAsString(result));
            System.out.println("F2_SUPPLIER_DATABASE: passed=" + passed + "; assertions=" + assertions + "; scenarios=" + outcomes.size());
            if (!passed) throw new AssertionError("Supplier database cases failed; original per-case results retained");
        } finally {
            StpUtil.setStpLogic(previous); OaOperationsChecks.identity(100000L, 1L);
        }
    }

    private static void scenario(OaOperationsDatabaseChecks fixture, String name, Scenario operation) {
        Map<String, Object> outcome = new LinkedHashMap<>(); outcome.put("name", name);
        try {
            OaOperationsChecks.identity(100000L, 1L); operation.run(fixture); outcome.put("passed", true);
            System.out.println("F2_CASE: " + name + "; passed=true");
        } catch (Throwable failure) {
            outcome.put("passed", false); outcome.put("failureType", failure.getClass().getName());
            outcome.put("failure", failure.getMessage());
            System.out.println("F2_CASE: " + name + "; passed=false; type=" + failure.getClass().getSimpleName());
        }
        outcomes.add(outcome);
    }

    private static void require(boolean condition, String description) {
        assertions++;
        if (!condition) throw new AssertionError(description);
    }

    private static SysSupplier supplier(OaOperationsDatabaseChecks fixture, String name) {
        SysSupplier input = new SysSupplier(); input.setSupplierName(fixture.marker + "-" + name);
        input.setSupplierCode(fixture.marker + "-supplier-" + ++supplierSequence); input.setStatus("ACTIVE");
        fixture.bean(SupplierServiceImpl.class).createSupplier(input);
        return fixture.mapper(SysSupplierMapper.class).selectById(input.getSupplierId());
    }

    private static void supplierRemoval(OaOperationsDatabaseChecks fixture) {
        SysSupplier input = supplier(fixture, "删除供应商");
        fixture.bean(SupplierServiceImpl.class).removeSuppliers(List.of(input.getSupplierId()));
        require(fixture.count("SELECT deleted FROM oa_supplier WHERE tenant_id=100000 AND supplier_id=?", input.getSupplierId()) == 1,
                "Removing an unused supplier must persist deleted=1");
        require(fixture.mapper(SysSupplierMapper.class).selectById(input.getSupplierId()) == null, "Deleted supplier must not be visible through normal reads");
    }

    private static void supplierPrivateFieldRoundtrip(OaOperationsDatabaseChecks fixture) throws Exception {
        SupplierServiceImpl service = fixture.bean(SupplierServiceImpl.class);
        SysSupplier initial = supplier(fixture, "隐私字段编辑");
        initial.setAddress("独立验收园区1号"); initial.setContactPhone("13800138000");
        initial.setContactEmail("supplier@example.invalid"); initial.setBankAccount("6222000000000000");
        service.updateSupplier(initial);
        ObjectMapper responseJson = new ObjectMapper().findAndRegisterModules()
                .registerModule(new SimpleModule().setSerializerModifier(new SensitiveBeanSerializerModifier()));
        SysSupplier displayed = responseJson.readValue(responseJson.writeValueAsString(
                fixture.mapper(SysSupplierMapper.class).selectById(initial.getSupplierId())), SysSupplier.class);
        require("独立验收园区****".equals(displayed.getAddress()) && "138****8000".equals(displayed.getContactPhone())
                && "s***@example.invalid".equals(displayed.getContactEmail()) && "6222 **** 0000".equals(displayed.getBankAccount()),
                "Actual response serialization masks all four private supplier fields");
        displayed.setShortName("仅修改简称"); service.updateSupplier(displayed);
        SysSupplier preserved = fixture.mapper(SysSupplierMapper.class).selectById(initial.getSupplierId());
        require("独立验收园区1号".equals(preserved.getAddress()) && "13800138000".equals(preserved.getContactPhone())
                && "supplier@example.invalid".equals(preserved.getContactEmail()) && "6222000000000000".equals(preserved.getBankAccount())
                && "仅修改简称".equals(preserved.getShortName()), "Editing another field must preserve the four complete stored private values");
        SysSupplier stale = responseJson.readValue(responseJson.writeValueAsString(preserved), SysSupplier.class);
        SysSupplier changed = responseJson.readValue(responseJson.writeValueAsString(preserved), SysSupplier.class);
        changed.setAddress("新独立验收园区2号"); changed.setContactPhone("13900139001");
        changed.setContactEmail("updated@example.invalid"); changed.setBankAccount("6222000000001234");
        service.updateSupplier(changed);
        SysSupplier replaced = fixture.mapper(SysSupplierMapper.class).selectById(initial.getSupplierId());
        require("新独立验收园区2号".equals(replaced.getAddress()) && "13900139001".equals(replaced.getContactPhone())
                && "updated@example.invalid".equals(replaced.getContactEmail()) && "6222000000001234".equals(replaced.getBankAccount()),
                "Explicit replacement saves all four complete new values");
        boolean rejected = false;
        try { service.updateSupplier(stale); } catch (IllegalArgumentException expected) {
            rejected = "记录已修改，请刷新后重试".equals(expected.getMessage());
        }
        require(rejected, "A stale masked form cannot overwrite the newly replaced private values");
        require(Objects.equals(replaced, fixture.mapper(SysSupplierMapper.class).selectById(initial.getSupplierId())),
                "Rejected stale input leaves the complete supplier row unchanged");
        SysSupplier repeated = responseJson.readValue(responseJson.writeValueAsString(replaced), SysSupplier.class);
        repeated.setShortName("再次修改简称"); service.updateSupplier(repeated);
        SysSupplier repeatedResult = fixture.mapper(SysSupplierMapper.class).selectById(initial.getSupplierId());
        require(Objects.equals(replaced.getAddress(), repeatedResult.getAddress())
                && Objects.equals(replaced.getContactPhone(), repeatedResult.getContactPhone())
                && Objects.equals(replaced.getContactEmail(), repeatedResult.getContactEmail())
                && Objects.equals(replaced.getBankAccount(), repeatedResult.getBankAccount()),
                "A second masked round trip preserves the replacement values");
        repeatedResult.setAddress(""); repeatedResult.setContactPhone("");
        repeatedResult.setContactEmail(""); repeatedResult.setBankAccount(""); service.updateSupplier(repeatedResult);
        SysSupplier cleared = fixture.mapper(SysSupplierMapper.class).selectById(initial.getSupplierId());
        require("".equals(cleared.getAddress()) && "".equals(cleared.getContactPhone())
                && "".equals(cleared.getContactEmail()) && "".equals(cleared.getBankAccount()),
                "Explicitly clearing optional private fields persists empty values");
    }

    private static OaSupplierCategory category(OaOperationsDatabaseChecks fixture, String code, Long parent) {
        OaSupplierCategory input = new OaSupplierCategory(); input.setCategoryCode(fixture.marker + "-" + code);
        input.setCategoryName(code); input.setParentId(parent);
        OaSupplierGovernanceService governance = fixture.bean(OaSupplierGovernanceService.class);
        Long id = governance.saveCategory(input);
        return governance.categories().stream().filter(row -> id.equals(row.getCategoryId())).findFirst().orElseThrow();
    }

    private static void categoryRemoval(OaOperationsDatabaseChecks fixture) {
        OaSupplierGovernanceService governance = fixture.bean(OaSupplierGovernanceService.class);
        OaSupplierCategory parent = category(fixture, "parent", null);
        OaSupplierCategory child = category(fixture, "child", parent.getCategoryId());
        require(child.getLevelPath().equals("/" + parent.getCategoryId() + "/" + child.getCategoryId() + "/"), "Category path must include its actual ancestry");
        boolean blocked = false;
        try { governance.removeCategory(parent.getCategoryId()); } catch (IllegalArgumentException expected) { blocked = true; }
        require(blocked, "A parent category with children must be protected");
        governance.removeCategory(child.getCategoryId());
        require(fixture.count("SELECT deleted FROM oa_supplier_category WHERE tenant_id=100000 AND category_id=?", child.getCategoryId()) == 1,
                "Removing a leaf category must persist deleted=1");
        require(governance.categories().stream().noneMatch(row -> child.getCategoryId().equals(row.getCategoryId())), "Deleted category must leave the visible tree");
        governance.removeCategory(parent.getCategoryId());
        require(governance.categories().stream().noneMatch(row -> parent.getCategoryId().equals(row.getCategoryId())), "The unreferenced parent can subsequently be removed");
    }

    private static OaSupplierQualification qualification(OaOperationsDatabaseChecks fixture, SysSupplier supplier, String type, LocalDate expiry) {
        OaSupplierQualification input = new OaSupplierQualification(); input.setSupplierId(supplier.getSupplierId());
        input.setQualificationType(type); input.setCertName("资格证件"); input.setLongTermFlag(0);
        input.setExpireDate(expiry); input.setReminderDays(30);
        Long id = fixture.bean(OaSupplierGovernanceService.class).saveQualification(input);
        return fixture.mapper(OaSupplierQualificationMapper.class).selectById(id);
    }

    private static void qualificationUpdates(OaOperationsDatabaseChecks fixture) {
        SysSupplier supplier = supplier(fixture, "资质更新");
        OaSupplierGovernanceService governance = fixture.bean(OaSupplierGovernanceService.class);
        OaSupplierQualification input = qualification(fixture, supplier, "BUSINESS_LICENSE", LocalDate.now().plusDays(60));
        governance.verifyQualification(input.getQualificationId(), false, "旧证件缺少印章");
        require("旧证件缺少印章".equals(fixture.mapper(OaSupplierQualificationMapper.class).selectById(input.getQualificationId()).getRejectReason()), "Rejected qualification retains its reason");
        governance.verifyQualification(input.getQualificationId(), true, null);
        OaSupplierQualification verified = fixture.mapper(OaSupplierQualificationMapper.class).selectById(input.getQualificationId());
        require(verified.getRejectReason() == null, "Successful verification must clear the old rejection reason");
        require(verified.getVerifyBy().equals(1L) && verified.getVerifyTime() != null, "Verification stores the actual actor and time");
        require(Objects.equals(verified.getExpireDate(), fixture.mapper(SysSupplierMapper.class).selectById(supplier.getSupplierId()).getQualificationExpireDate()), "Supplier expiry follows verified qualification");
        verified.setLongTermFlag(1); governance.saveQualification(verified);
        OaSupplierQualification updated = fixture.mapper(OaSupplierQualificationMapper.class).selectById(input.getQualificationId());
        require(updated.getExpireDate() == null && updated.getLongTermFlag() == 1, "Changing to long-term must clear the persisted expiry date");
        require("PENDING".equals(updated.getVerifyStatus()) && updated.getVerifyBy() == null && updated.getVerifyTime() == null && updated.getRejectReason() == null,
                "Editing the certificate resets verification and old verifier fields");
        require(fixture.mapper(SysSupplierMapper.class).selectById(supplier.getSupplierId()).getQualificationExpireDate() == null, "Supplier summary expiry must clear when no finite verified qualification remains");
    }

    private static SupplierScorecardDTO score(OaOperationsDatabaseChecks fixture, Long cardId, List<OaSupplierScoreCriteria> items) {
        SupplierScorecardDTO request = new SupplierScorecardDTO();
        request.setScorecard(fixture.mapper(OaSupplierScorecardMapper.class).selectById(cardId));
        request.setCriteria(items); return request;
    }

    private static void scoreDimensions(OaOperationsDatabaseChecks fixture) {
        SysSupplier supplier = supplier(fixture, "维度恢复");
        OaSupplierGovernanceService governance = fixture.bean(OaSupplierGovernanceService.class);
        Long cardId = governance.ensurePendingScorecard(supplier.getSupplierId(), "MONTHLY", LocalDate.now().withDayOfMonth(1), LocalDate.now());
        List<OaSupplierScoreCriteria> initial = governance.criteria(cardId);
        require(initial.size() == 4, "A new scorecard has all four initial criteria");
        for (OaSupplierScoreCriteria item : initial) item.setScore(new BigDecimal("80"));
        governance.saveScorecard(score(fixture, cardId, initial));
        List<OaSupplierScoreCriteria> reduced = new ArrayList<>(governance.criteria(cardId));
        OaSupplierScoreCriteria removed = reduced.stream().filter(item -> "PRICE".equals(item.getCriteriaCode())).findFirst().orElseThrow();
        Long removedId = removed.getCriteriaId(); reduced.remove(removed);
        for (OaSupplierScoreCriteria item : reduced) item.setWeight(new BigDecimal("QUALITY".equals(item.getCriteriaCode()) ? "0.40" : "0.30"));
        governance.saveScorecard(score(fixture, cardId, reduced));
        require(governance.criteria(cardId).size() == 3, "Removing a criterion must remove it from the next read");
        require(fixture.count("SELECT deleted FROM oa_supplier_score_criteria WHERE tenant_id=100000 AND criteria_id=?", removedId) == 1, "Removed criterion remains as deleted history");
        OaOperationsChecks.identity(100001L, 1L);
        try {
            require(fixture.mapper(OaSupplierScoreCriteriaMapper.class).restoreDraftCriterion(removed) == 0, "The custom restore SQL cannot cross the current tenant boundary");
        } finally { OaOperationsChecks.identity(100000L, 1L); }
        require(fixture.count("SELECT deleted FROM oa_supplier_score_criteria WHERE tenant_id=100000 AND criteria_id=?", removedId) == 1, "Rejected foreign-tenant restoration keeps the old history deleted");
        List<OaSupplierScoreCriteria> restored = new ArrayList<>(governance.criteria(cardId)); restored.add(removed);
        for (OaSupplierScoreCriteria item : restored) item.setWeight(new BigDecimal(
                "DELIVERY_ON_TIME".equals(item.getCriteriaCode()) || "QUALITY".equals(item.getCriteriaCode()) ? "0.30" : "0.20"));
        governance.saveScorecard(score(fixture, cardId, restored));
        require(governance.criteria(cardId).size() == 4, "A removed dimension can be restored in a draft scorecard");
        require(fixture.count("SELECT COUNT(*) FROM oa_supplier_score_criteria WHERE tenant_id=100000 AND scorecard_id=? AND criteria_code='PRICE'", cardId) == 1,
                "Restoring the same code reuses one unique history row");
        require(governance.criteria(cardId).stream().anyMatch(item -> removedId.equals(item.getCriteriaId())), "Restored dimension keeps its original identity");
        List<OaSupplierScoreCriteria> confirmedItems = new ArrayList<>(governance.criteria(cardId));
        confirmedItems.removeIf(item -> "PRICE".equals(item.getCriteriaCode()));
        for (OaSupplierScoreCriteria item : confirmedItems) item.setWeight(new BigDecimal("QUALITY".equals(item.getCriteriaCode()) ? "0.40" : "0.30"));
        governance.saveScorecard(score(fixture, cardId, confirmedItems)); governance.confirmScorecard(cardId);
        require(fixture.mapper(OaSupplierScoreCriteriaMapper.class).restoreDraftCriterion(removed) == 0, "Confirmed scorecards cannot restore removed criteria through the custom SQL");
        require(governance.criteria(cardId).size() == 3, "Denied restoration preserves the confirmed scorecard dimensions");
    }

    private static void scoreBands(OaOperationsDatabaseChecks fixture) {
        OaSupplierGovernanceService governance = fixture.bean(OaSupplierGovernanceService.class);
        List<String> values = List.of("0.00", "59.99", "60.00", "74.99", "75.00", "89.99", "90.00", "100.00");
        List<String> levels = List.of("ELIMINATED", "ELIMINATED", "WATCH", "WATCH", "QUALIFIED", "QUALIFIED", "EXCELLENT", "EXCELLENT");
        for (int index = 0; index < values.size(); index++) {
            SysSupplier supplier = supplier(fixture, "分档" + index);
            Long cardId = governance.ensurePendingScorecard(supplier.getSupplierId(), "MONTHLY", LocalDate.now().withDayOfMonth(1), LocalDate.now());
            List<OaSupplierScoreCriteria> items = governance.criteria(cardId);
            for (OaSupplierScoreCriteria item : items) { item.setDataSource("MANUAL"); item.setScore(new BigDecimal(values.get(index))); }
            governance.saveScorecard(score(fixture, cardId, items));
            OaSupplierScorecard saved = fixture.mapper(OaSupplierScorecardMapper.class).selectById(cardId);
            require(saved.getTotalScore().compareTo(new BigDecimal(values.get(index))) == 0 && levels.get(index).equals(saved.getStanding()), "Exact score boundary " + values.get(index));
            governance.confirmScorecard(cardId); governance.confirmScorecard(cardId);
            SysSupplier confirmed = fixture.mapper(SysSupplierMapper.class).selectById(supplier.getSupplierId());
            require(confirmed.getScore().compareTo(saved.getTotalScore()) == 0 && confirmed.getStanding().equals(saved.getStanding()), "Confirmation fills supplier's actual score exactly once");
        }
    }

    private static void criticalQualifications(OaOperationsDatabaseChecks fixture) {
        OaSupplierGovernanceService governance = fixture.bean(OaSupplierGovernanceService.class);
        SysSupplier other = supplier(fixture, "非关键资质"); qualification(fixture, other, "ISO", LocalDate.now().minusDays(1));
        governance.assertSupplierAllowed(other.getSupplierId(), "PURCHASE");
        require(true, "An expired noncritical certificate alone does not invoke the business-license block");
        SysSupplier critical = supplier(fixture, "关键资质"); qualification(fixture, critical, "BUSINESS_LICENSE", LocalDate.now().minusDays(1));
        boolean blocked = false;
        try { governance.assertSupplierAllowed(critical.getSupplierId(), "PURCHASE"); }
        catch (ServiceException expected) { blocked = Integer.valueOf(400).equals(expected.getCode()) && expected.getMessage().contains("关键资质已过期"); }
        require(blocked, "An expired business license blocks supplier admission");
    }

    private static void expiryScan(OaOperationsDatabaseChecks fixture) {
        OaSupplierGovernanceService governance = fixture.bean(OaSupplierGovernanceService.class);
        SysSupplier retired = supplier(fixture, "已删供应商扫描输入");
        OaSupplierQualification old = qualification(fixture, retired, "BUSINESS_LICENSE", LocalDate.now().minusDays(1));
        // Explicit historical input: one logically deleted parent, without changing other business rows.
        fixture.jdbc.update("UPDATE oa_supplier SET deleted=1 WHERE tenant_id=100000 AND supplier_id=?", retired.getSupplierId());
        SysSupplier active = supplier(fixture, "有效供应商扫描");
        OaSupplierQualification due = qualification(fixture, active, "BUSINESS_LICENSE", LocalDate.now().minusDays(1));
        governance.scanQualificationExpiry();
        require("EXPIRED".equals(fixture.mapper(OaSupplierQualificationMapper.class).selectById(due.getQualificationId()).getVerifyStatus()), "An unrelated retired supplier must not abort processing active certificates");
        require(fixture.count("SELECT COUNT(*) FROM oa_supplier_qualification_reminder_log WHERE tenant_id=100000 AND qualification_id=?", old.getQualificationId()) == 0,
                "A retired supplier receives no expiry reminder");
        long reminders = fixture.count("SELECT COUNT(*) FROM oa_supplier_qualification_reminder_log WHERE tenant_id=100000 AND qualification_id=?", due.getQualificationId());
        require(reminders == 1, "The active expired qualification emits one reminder");
        governance.scanQualificationExpiry();
        require(fixture.count("SELECT COUNT(*) FROM oa_supplier_qualification_reminder_log WHERE tenant_id=100000 AND qualification_id=?", due.getQualificationId()) == reminders,
                "A repeated scan does not duplicate the active qualification reminder");
    }
}
