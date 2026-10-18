package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmDealEvent;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.CrmSalesTarget;
import com.cloudflow.crm.domain.dto.CrmSalesTargetWriteDTO;
import com.cloudflow.crm.domain.vo.CrmSalesTargetPreviewVO;
import com.cloudflow.crm.domain.vo.HrEmployeeSummaryVO;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import com.cloudflow.crm.service.deal.CrmDealLedgerService;
import com.cloudflow.crm.service.deal.CrmDealPolicy;
import com.cloudflow.crm.service.deal.CrmReceiptAchievementService;
import com.cloudflow.crm.service.deal.CrmReceiptAchievementService.Amounts;
import com.fasterxml.jackson.core.type.TypeReference;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import org.springframework.transaction.support.TransactionTemplate;
import static com.cloudflow.crm.service.impl.CrmOperationsChecks.*;

final class CrmSalesTargetDatabaseChecks {
    private static final long FIRST = 870001L;
    private static final long SECOND = 870002L;
    private static final long FIRST_DEPT = 870011L;
    private static final long SECOND_DEPT = 870012L;
    private static final LocalDate START = LocalDate.of(2025, 2, 1);
    private static final LocalDate END = LocalDate.of(2025, 2, 28);
    private final CrmOperationsDatabaseChecks fixture;
    private final CrmReceiptAchievementService receipts;
    private final CrmSalesTargetServiceImpl targets;
    private final CrmDealLedgerService ledger;
    private final TransactionTemplate transaction;
    private final String label = "Target-" + UUID.randomUUID();
    private CrmCustomer customer;
    private CrmReceivable receivable;

    private CrmSalesTargetDatabaseChecks(CrmOperationsDatabaseChecks fixture) {
        this.fixture = fixture; receipts = fixture.bean(CrmReceiptAchievementService.class);
        targets = fixture.bean(CrmSalesTargetServiceImpl.class); ledger = fixture.bean(CrmDealLedgerService.class);
        transaction = fixture.bean(TransactionTemplate.class);
    }

    static void run(CrmOperationsDatabaseChecks fixture) throws Exception {
        int before = assertionCount(); identity();
        CrmSalesTargetDatabaseChecks checks = new CrmSalesTargetDatabaseChecks(fixture);
        try { checks.setup(); checks.aggregation(); checks.targets(); checks.permissions(); checks.validation(); checks.concurrency(); }
        finally { identity(); fixture.employeeDirectory.remove(FIRST); fixture.employeeDirectory.remove(SECOND); fixture.missingEmployees.clear(); }
        System.out.println("H3_SALES_TARGET_DATABASE_CHECKS: assertions=" + (assertionCount() - before)
                + "; failed=0; concurrency_groups=3; mysql=true; hr=interface_double; permission_identity=controlled_fixture; real_http=false; production_modified=false");
    }

    private void setup() {
        fixture.jdbc.update("INSERT INTO sys_dept (dept_id,tenant_id,dept_name,status,deleted) VALUES (?,100000,'Target department A','0',0),(?,100000,'Target department B','0',0)", FIRST_DEPT, SECOND_DEPT);
        HrEmployeeSummaryVO first = fixture.employee(FIRST); first.setDeptId(FIRST_DEPT); first.setDeptName("Target department A"); fixture.employeeDirectory.put(FIRST, first);
        HrEmployeeSummaryVO second = fixture.employee(SECOND); second.setDeptId(SECOND_DEPT); second.setDeptName("Target department B"); fixture.employeeDirectory.put(SECOND, second);
        customer = fixture.customer(label); customer.setOwnerId(FIRST); customer.setDeptId(FIRST_DEPT); fixture.mapper(CrmCustomerMapper.class).updateById(customer);
        receivable = fixture.receivable(customer, null, "500.00", "185.01", END);
        receivable.setOwnerId(FIRST); receivable.setReceivedDate(START.plusDays(14)); fixture.mapper(CrmReceivableMapper.class).updateById(receivable);
        CrmDealEvent firstReceipt = append(receivable.getReceivableId(), "100.01", "CNY", START.plusDays(4).atStartOfDay(), false, "0.7000");
        append(receivable.getReceivableId(), "20.00", "CNY", START.plusDays(7).atStartOfDay(), false, "0.2000");
        append(receivable.getReceivableId(), "20.00", "CNY", START.plusDays(1).atStartOfDay(), true, "0.7000");
        append(receivable.getReceivableId(), "50.00", "CNY", START.minusDays(1).atStartOfDay(), false, "0.5000");
        transaction.executeWithoutResult(status -> ledger.refund(new CrmDealLedgerService.Refund(firstReceipt.getEventId(), "target-refund-" + UUID.randomUUID(),
                new BigDecimal("5.00"), START.plusDays(14).atStartOfDay(), 9, "Selected original receipt fixture", fixture.json.createObjectNode().put("test", "target-refund"))));
        fixture.jdbc.update("INSERT INTO oa_contract (tenant_id,contract_no,contract_name,counterparty_name,contract_type,amount,currency,status,customer_id,deleted,version) VALUES (100000,?,'Target USD contract','Target customer','SALES',100,'USD','APPROVED',?,0,0)", label, customer.getCustomerId());
        Long contractId = fixture.jdbc.queryForObject("SELECT contract_id FROM oa_contract WHERE contract_no=? AND tenant_id=100000", Long.class, label);
        CrmReceivable foreignCurrency = fixture.receivable(customer, contractId, "100.00", "30.00", END);
        foreignCurrency.setOwnerId(FIRST); foreignCurrency.setReceivedDate(START.plusDays(10)); fixture.mapper(CrmReceivableMapper.class).updateById(foreignCurrency);
        append(foreignCurrency.getReceivableId(), "30.00", "USD", START.plusDays(10).atStartOfDay(), false, "1.0000");
        identity(100001L, 1L, 0);
        try { append(receivable.getReceivableId(), "999.00", "CNY", START.atStartOfDay(), false, "1.0000"); }
        finally { identity(); }
    }

    private com.cloudflow.crm.domain.CrmDealEvent append(Long id, String amount, String currency, LocalDateTime time, boolean baseline, String firstShare) {
        BigDecimal share = new BigDecimal(firstShare);
        List<CrmDealPolicy.Member> members = List.of(new CrmDealPolicy.Member(FIRST, FIRST, "First", FIRST_DEPT, "OWNER", share, null),
                new CrmDealPolicy.Member(SECOND, SECOND, "Second", SECOND_DEPT, "CO_SELLER", BigDecimal.ONE.subtract(share), null));
        return transaction.execute(status -> ledger.append(new CrmDealLedgerService.Fact("target-receipt-" + UUID.randomUUID(), "RECEIPT", "RECEIVABLE", id,
                customer.getCustomerId(), new BigDecimal(amount), currency, time, 1, "cloudflow-service-crm", 1,
                fixture.json.createObjectNode().put("test", "target-receipt-database-fixture"), baseline), members));
    }

    private Map<Long, Amounts> amounts(String dimension, List<Long> ids, String basis, String currency) {
        return receipts.summarize(dimension, ids, START, END, basis, currency, receipts.scope());
    }

    private void aggregation() {
        Map<Long, Amounts> owners = amounts("OWNER", List.of(FIRST, SECOND), "TEAM_V2", "CNY");
        decimal("70.51", owners.get(FIRST).received(), "receipt target follows each immutable split and selected-source partial refund");
        decimal("44.50", owners.get(SECOND).received(), "second member receives own historical allocations");
        decimal("14.00", owners.get(FIRST).baseline(), "opening snapshot is separately labelled and excluded from achieved amount");
        decimal("6.00", owners.get(SECOND).baseline(), "partner opening snapshot remains separately visible");
        Map<Long, Amounts> departments = amounts("DEPT", List.of(FIRST_DEPT, SECOND_DEPT), "TEAM_V2", "CNY");
        decimal("70.51", departments.get(FIRST_DEPT).received(), "department uses occurrence-time snapshot");
        decimal("44.50", departments.get(SECOND_DEPT).received(), "other department does not receive the owner's full amount");
        decimal("30.00", amounts("OWNER", List.of(FIRST), "TEAM_V2", "USD").get(FIRST).received(), "USD is not mixed with CNY");
        decimal("30.00", amounts("OWNER", List.of(FIRST), "OWNER_V1", "USD").get(FIRST).received(), "legacy currency is read from the actual associated contract");
        decimal("185.01", amounts("OWNER", List.of(FIRST), "OWNER_V1", "CNY").get(FIRST).received(), "legacy basis retains last-receipt-date cumulative amount");
        equal(0, amounts("OWNER", List.of(), "TEAM_V2", "CNY").size(), "empty subject set cannot expand to all users");
        equal(0, amounts("OWNER", List.of(FIRST), "TEAM_V2", "EUR").size(), "unknown amount is not silently converted to another currency");
        fixture.employeeDirectory.get(FIRST).setDeptId(SECOND_DEPT);
        decimal("70.51", amounts("DEPT", List.of(FIRST_DEPT), "TEAM_V2", "CNY").get(FIRST_DEPT).received(), "staff transfer does not reassign historical department performance");
        fixture.employeeDirectory.get(FIRST).setDeptId(FIRST_DEPT);
        long before = fixture.scalar("SELECT COUNT(*) FROM crm_deal_event");
        amounts("OWNER", List.of(FIRST, SECOND), "TEAM_V2", "CNY");
        equal(before, fixture.scalar("SELECT COUNT(*) FROM crm_deal_event"), "reading targets creates no reconstructed receipts");
    }

    private CrmSalesTargetWriteDTO request(String suffix) {
        return new CrmSalesTargetWriteDTO(null, null, UUID.randomUUID().toString().replace("-", ""), label + suffix,
                "OWNER", "MONTH", 2025, 2, null, FIRST, "100.00", "TEAM_V2", "CNY", "ACTIVE", "target fixture", null, false);
    }

    private CrmSalesTargetWriteDTO change(CrmSalesTargetWriteDTO original, Consumer<Map<String, Object>> alteration) {
        Map<String, Object> values = fixture.json.convertValue(original, new TypeReference<Map<String, Object>>() { });
        alteration.accept(values); return fixture.json.convertValue(values, CrmSalesTargetWriteDTO.class);
    }

    private CrmSalesTargetWriteDTO edit(CrmSalesTarget row) {
        return new CrmSalesTargetWriteDTO(row.getSalesTargetId(), row.getVersion(), null, row.getTargetName(), row.getDimensionType(), row.getPeriodType(),
                row.getTargetYear(), row.getTargetPeriod(), row.getDeptId(), row.getOwnerId(), row.getTargetAmount().toPlainString(), row.getCalculationBasis(), row.getCurrency(),
                row.getStatus(), row.getRemark(), null, false);
    }

    private void targets() throws Exception {
        CrmSalesTargetWriteDTO request = change(request("-default"), values -> { values.put("calculationBasis", null); values.put("currency", null); });
        CrmSalesTarget row = targets.createSalesTarget(request);
        equal("TEAM_V2", row.getCalculationBasis(), "new targets default to approved team basis");
        equal("CNY", row.getCurrency(), "new target currency is explicit CNY");
        equal(FIRST_DEPT, row.getDeptId(), "personal target receives trusted directory department");
        equal("CRM user " + FIRST, row.getOwnerName(), "target subject name is resolved from HR");
        decimal("70.51", row.getAchievedAmount(), "target attained amount matches frozen receipt sum");
        decimal("29.49", row.getGapAmount(), "target gap retains cent precision");
        decimal("70.51", row.getCompletionRate(), "completion uses target amount and correct team basis");
        equal(row.getSalesTargetId(), targets.createSalesTarget(request).getSalesTargetId(), "same creation key returns original target");
        equal(row.getSalesTargetId(), targets.creation(request.requestKey()).getSalesTargetId(), "lost response is recoverable by original creation key");
        fails(IllegalArgumentException.class, () -> targets.createSalesTarget(change(request, values -> values.put("targetName", "conflicting key"))), "same key cannot replace original target with different content");
        CrmSalesTargetWriteDTO switchRequest = change(edit(row), values -> values.put("calculationBasis", "OWNER_V1"));
        fails(IllegalArgumentException.class, () -> targets.updateSalesTarget(switchRequest), "basis cannot silently change without preview confirmation");
        CrmSalesTargetPreviewVO preview = targets.preview(switchRequest);
        decimal("185.01", preview.ownerReceivedAmount(), "preview shows real legacy cumulative receipts");
        decimal("70.51", preview.teamReceivedAmount(), "preview shows real frozen team receipts");
        equal(true, preview.confirmationRequired(), "basis preview explicitly requires confirmation");
        CrmSalesTargetWriteDTO approved = change(switchRequest, values -> { values.put("basisChangeConfirmed", true); values.put("previewFingerprint", preview.fingerprint()); });
        append(receivable.getReceivableId(), "1.00", "CNY", START.plusDays(15).atStartOfDay(), false, "1.0000");
        fixture.jdbc.update("UPDATE crm_receivable SET received_amount=186.01 WHERE receivable_id=? AND tenant_id=100000", receivable.getReceivableId());
        fails(IllegalArgumentException.class, () -> targets.updateSalesTarget(approved), "new receipt invalidates stale comparison before basis switch");
        CrmSalesTargetPreviewVO refreshed = targets.preview(switchRequest);
        CrmSalesTarget changed = targets.updateSalesTarget(change(switchRequest, values -> { values.put("basisChangeConfirmed", true); values.put("previewFingerprint", refreshed.fingerprint()); }));
        equal("OWNER_V1", changed.getCalculationBasis(), "explicitly confirmed switch retains distinct legacy basis");
        decimal("186.01", changed.getAchievedAmount(), "legacy target evaluates its own basis after switch");
        fails(IllegalArgumentException.class, () -> targets.updateSalesTarget(edit(row)), "stale target version cannot overwrite saved switch");
        CrmSalesTargetWriteDTO usdRequest = change(edit(changed), values -> { values.put("calculationBasis", "TEAM_V2"); values.put("currency", "USD"); });
        CrmSalesTargetPreviewVO usdPreview = targets.preview(usdRequest);
        decimal("30.00", usdPreview.teamReceivedAmount(), "currency-switch preview never sums different currencies");
        CrmSalesTarget usd = targets.updateSalesTarget(change(usdRequest, values -> { values.put("basisChangeConfirmed", true); values.put("previewFingerprint", usdPreview.fingerprint()); }));
        decimal("30.00", usd.getAchievedAmount(), "confirmed USD target is evaluated only in USD");
        CrmSalesTarget team = targets.createSalesTarget(request("-team"));
        CrmSalesTarget legacy = targets.createSalesTarget(change(request("-legacy"), values -> values.put("calculationBasis", "OWNER_V1")));
        CrmSalesTarget query = new CrmSalesTarget(); query.setTargetName(label);
        PageQuery pageQuery = new PageQuery(); pageQuery.setPageNum(1); pageQuery.setPageSize(100);
        PageResult<CrmSalesTarget> page = targets.queryPage(query, pageQuery);
        decimal("71.51", page.getRows().stream().filter(item -> item.getSalesTargetId().equals(team.getSalesTargetId())).findFirst().orElseThrow().getAchievedAmount(), "same-period page separates TEAM_V2 results");
        decimal("186.01", page.getRows().stream().filter(item -> item.getSalesTargetId().equals(legacy.getSalesTargetId())).findFirst().orElseThrow().getAchievedAmount(), "same-period page separates OWNER_V1 results");
        decimal("30.00", page.getRows().stream().filter(item -> item.getSalesTargetId().equals(usd.getSalesTargetId())).findFirst().orElseThrow().getAchievedAmount(), "same-period page separates USD results");
        query.setCalculationBasis("TEAM_V2"); query.setCurrency("CNY");
        check(targets.queryPage(query, pageQuery).getRows().stream().allMatch(item -> "TEAM_V2".equals(item.getCalculationBasis()) && "CNY".equals(item.getCurrency())), "basis and currency filter include only requested rows");
        CrmSalesTarget department = targets.createSalesTarget(change(request("-department"), values -> { values.put("dimensionType", "DEPT"); values.put("deptId", FIRST_DEPT); }));
        equal(null, department.getOwnerId(), "department target cannot retain spoofed owner");
        equal("Target department A", department.getDeptName(), "department label comes from active trusted directory");
        decimal("71.51", department.getAchievedAmount(), "department target uses frozen allocation department");
        targets.removeSalesTargets(List.of(department.getSalesTargetId()), List.of(department.getVersion()));
        fails(IllegalArgumentException.class, () -> targets.detail(department.getSalesTargetId()), "deleted target is not readable");
        equal(1L, fixture.scalar("SELECT COUNT(*) FROM crm_sales_target WHERE sales_target_id=? AND deleted=1 AND version=1", department.getSalesTargetId()), "target deletion is versioned and logical");
        String serialized = fixture.json.writeValueAsString(team);
        check(serialized.contains("\"targetAmount\":\"100.00\"") && serialized.contains("\"achievedAmount\":\"71.51\""), "target money is serialized as exact decimal text");
    }

    private void permissions() {
        CrmSalesTarget own = targets.createSalesTarget(request("-scope-first"));
        CrmSalesTarget other = targets.createSalesTarget(change(request("-scope-second"), values -> values.put("ownerId", SECOND)));
        identity(100000L, FIRST, 4);
        try {
            equal(own.getSalesTargetId(), targets.detail(own.getSalesTargetId()).getSalesTargetId(), "self scope can read own target");
            fails(IllegalArgumentException.class, () -> targets.detail(other.getSalesTargetId()), "self scope cannot read other target by ID");
            fails(IllegalArgumentException.class, () -> targets.preview(edit(other)), "self scope cannot preview another target");
            fails(IllegalArgumentException.class, () -> targets.updateSalesTarget(edit(other)), "self scope cannot update another target");
            fails(IllegalArgumentException.class, () -> targets.createSalesTarget(change(request("-denied"), values -> values.put("ownerId", SECOND))), "self scope cannot assign another person's target");
            fails(IllegalArgumentException.class, () -> targets.removeSalesTargets(List.of(own.getSalesTargetId(), other.getSalesTargetId()), List.of(0, 0)), "mixed authorized/unauthorized deletion is rejected");
            equal(own.getSalesTargetId(), targets.detail(own.getSalesTargetId()).getSalesTargetId(), "mixed deletion rolls back the authorized earlier row");
            Map<Long, Amounts> visible = amounts("OWNER", List.of(FIRST, SECOND), "TEAM_V2", "CNY");
            equal(1, visible.size(), "self scope is applied before aggregate rather than after total");
            decimal("71.51", visible.get(FIRST).received(), "self performance never includes other member amount");
        } finally { identity(); }
        identity(100000L, 1L, 3); UserContext.setDsDeptIds(List.of(FIRST_DEPT));
        try {
            equal(own.getSalesTargetId(), targets.detail(own.getSalesTargetId()).getSalesTargetId(), "department scope includes trusted personal target department");
            fails(IllegalArgumentException.class, () -> targets.detail(other.getSalesTargetId()), "department scope excludes foreign department target");
            Map<Long, Amounts> visible = amounts("DEPT", List.of(FIRST_DEPT, SECOND_DEPT), "TEAM_V2", "CNY");
            equal(1, visible.size(), "department aggregate applies scope before sums");
            decimal("71.51", visible.get(FIRST_DEPT).received(), "department aggregate cannot include another department");
        } finally { identity(); }
        identity(100001L, 1L, 0);
        try {
            fails(IllegalArgumentException.class, () -> targets.detail(own.getSalesTargetId()), "foreign tenant cannot read target");
            fails(IllegalArgumentException.class, () -> targets.updateSalesTarget(edit(own)), "foreign tenant cannot update target");
            decimal("999.00", amounts("OWNER", List.of(FIRST), "TEAM_V2", "CNY").get(FIRST).received(), "same numeric member ID remains tenant isolated");
        } finally { identity(); }
        UserContext.setUserId(null);
        fails(ServiceException.class, receipts::scope, "missing trusted user identity cannot become unrestricted performance scope");
        identity();
    }

    private void validation() {
        for (String amount : List.of("-1", "0.001", "1e1", "NaN", "", "100000000000000.00"))
            fails(IllegalArgumentException.class, () -> targets.createSalesTarget(change(request("-bad-amount"), values -> values.put("targetAmount", amount))), "invalid exact target amount rejected: " + amount);
        for (int year : List.of(999, 10000)) fails(IllegalArgumentException.class, () -> targets.createSalesTarget(change(request("-bad-year"), values -> values.put("targetYear", year))), "invalid target year rejected");
        fails(IllegalArgumentException.class, () -> targets.createSalesTarget(change(request("-bad-month"), values -> values.put("targetPeriod", 13))), "month outside 1-12 rejected");
        fails(IllegalArgumentException.class, () -> targets.createSalesTarget(change(request("-bad-quarter"), values -> { values.put("periodType", "QUARTER"); values.put("targetPeriod", 5); })), "quarter outside 1-4 rejected");
        fails(IllegalArgumentException.class, () -> targets.createSalesTarget(change(request("-bad-basis"), values -> values.put("calculationBasis", "ALL"))), "unknown basis cannot fall back silently");
        fails(IllegalArgumentException.class, () -> targets.createSalesTarget(change(request("-bad-currency"), values -> values.put("currency", "CNY,USD"))), "multiple currencies cannot be summed");
        fails(IllegalArgumentException.class, () -> targets.createSalesTarget(change(request("-bad-key"), values -> values.put("requestKey", "../../bad"))), "creation key cannot become an arbitrary target number");
        fixture.missingEmployees.add(FIRST);
        try { fails(IllegalArgumentException.class, () -> targets.createSalesTarget(request("-missing-user")), "unavailable or missing subject cannot be saved from browser labels"); }
        finally { fixture.missingEmployees.remove(FIRST); }
        fixture.jdbc.update("UPDATE sys_dept SET status='1' WHERE dept_id=?", FIRST_DEPT);
        try { fails(IllegalArgumentException.class, () -> targets.createSalesTarget(change(request("-inactive-dept"), values -> { values.put("dimensionType", "DEPT"); values.put("deptId", FIRST_DEPT); })), "disabled department cannot receive a new target"); }
        finally { fixture.jdbc.update("UPDATE sys_dept SET status='0' WHERE dept_id=?", FIRST_DEPT); }
        CrmSalesTarget zero = targets.createSalesTarget(change(request("-zero"), values -> values.put("targetAmount", "0")));
        decimal("0.00", zero.getCompletionRate(), "zero target does not divide by zero");
        CrmSalesTarget maximum = targets.createSalesTarget(change(request("-maximum"), values -> { values.put("targetAmount", "99999999999999.99"); values.put("targetYear", 9999); values.put("periodType", "YEAR"); }));
        decimal("99999999999999.99", maximum.getTargetAmount(), "existing DECIMAL(16,2) maximum remains exact");
        decimal("0.00", maximum.getAchievedAmount(), "future target does not include past receipts");
        equal(null, maximum.getTargetPeriod(), "yearly target clears month and quarter field");
        fails(IllegalArgumentException.class, () -> targets.removeSalesTargets(List.of(zero.getSalesTargetId()), List.of(1)), "stale delete version is rejected");
        equal(zero.getSalesTargetId(), targets.detail(zero.getSalesTargetId()).getSalesTargetId(), "stale delete preserves target");
    }

    private void concurrency() throws Exception {
        CrmSalesTargetWriteDTO creation = request("-concurrent-create");
        CountDownLatch createStart = new CountDownLatch(2);
        int[] created = fixture.parallel(() -> { await(createStart); return targets.createSalesTarget(creation).getSalesTargetId().intValue(); },
                () -> { await(createStart); return targets.createSalesTarget(creation).getSalesTargetId().intValue(); });
        equal(created[0], created[1], "parallel identical create requests resolve to one original target");
        equal(1L, fixture.scalar("SELECT COUNT(*) FROM crm_sales_target WHERE tenant_id=100000 AND target_no=?", "MB" + creation.requestKey()), "unique request number prevents duplicate targets");
        CrmSalesTarget target = targets.detail((long) created[0]);
        CountDownLatch updateStart = new CountDownLatch(2);
        int[] updated = fixture.parallel(() -> { await(updateStart); return attempt(() -> targets.updateSalesTarget(change(edit(target), values -> values.put("targetName", label + "-winner-one")))); },
                () -> { await(updateStart); return attempt(() -> targets.updateSalesTarget(change(edit(target), values -> values.put("targetName", label + "-winner-two")))); });
        equal(1, updated[0] + updated[1], "concurrent edits against one version have one winner");
        equal(1, targets.detail(target.getSalesTargetId()).getVersion(), "failed concurrent edit cannot consume a second version");
        CrmSalesTarget current = targets.detail(target.getSalesTargetId());
        CountDownLatch removeStart = new CountDownLatch(2);
        int[] removed = fixture.parallel(() -> { await(removeStart); return attempt(() -> targets.removeSalesTargets(List.of(current.getSalesTargetId()), List.of(current.getVersion()))); },
                () -> { await(removeStart); return attempt(() -> targets.updateSalesTarget(change(edit(current), values -> values.put("targetName", label + "-last-edit")))); });
        equal(1, removed[0] + removed[1], "delete and edit against same version cannot both succeed");
        equal(2L, fixture.scalar("SELECT version FROM crm_sales_target WHERE sales_target_id=?", target.getSalesTargetId()), "mixed mutation advances target version only once");
    }

    private static int attempt(Runnable action) { try { action.run(); return 1; } catch (IllegalArgumentException rejected) { return 0; } }
    private static void await(CountDownLatch latch) throws InterruptedException { latch.countDown(); if (!latch.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Target concurrency barrier timed out"); }
}
