package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmDealAllocation;
import com.cloudflow.crm.domain.CrmDealEvent;
import com.cloudflow.crm.domain.CrmDealTeam;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.dto.CrmDealTeamRequest;
import com.cloudflow.crm.domain.dto.CrmOpportunityReopenRequest;
import com.cloudflow.crm.domain.vo.CrmPerformanceSummaryVO;
import com.cloudflow.crm.domain.vo.HrEmployeeSummaryVO;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.mapper.CrmDealAllocationMapper;
import com.cloudflow.crm.mapper.CrmDealEventMapper;
import com.cloudflow.crm.mapper.CrmDealTeamMapper;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import com.cloudflow.crm.service.deal.CrmDealLedgerService;
import com.cloudflow.crm.service.deal.CrmDealPolicy;
import com.cloudflow.crm.service.deal.CrmOpportunityTeamService;
import com.cloudflow.crm.service.opportunity.CrmOpportunityReopenService;
import com.cloudflow.crm.service.opportunity.CrmOpportunityWriteService;
import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.transaction.support.TransactionTemplate;
import static com.cloudflow.crm.service.impl.CrmOperationsChecks.*;

final class CrmPerformanceDatabaseChecks {
    private static final long FIRST = 876101L;
    private static final long SECOND = 876102L;
    private static final long THIRD = 876103L;
    private static final long FIRST_DEPT = 876111L;
    private static final long SECOND_DEPT = 876112L;
    private static final long THIRD_DEPT = 876113L;
    private static final LocalDate CURRENT = LocalDate.now().withDayOfMonth(1);
    private static final LocalDate PRIOR = CURRENT.minusMonths(1);
    private final CrmOperationsDatabaseChecks fixture;
    private final CrmPerformanceQueryServiceImpl performance;
    private final CrmDealLedgerService ledger;
    private final CrmOpportunityReopenService reopening;
    private final CrmOpportunityWriteService writes;
    private final TransactionTemplate transactions;
    private final String label = "Performance-" + UUID.randomUUID();
    private CrmCustomer customer;

    private CrmPerformanceDatabaseChecks(CrmOperationsDatabaseChecks fixture) {
        this.fixture = fixture;
        performance = fixture.bean(CrmPerformanceQueryServiceImpl.class);
        ledger = fixture.bean(CrmDealLedgerService.class);
        reopening = fixture.bean(CrmOpportunityReopenService.class);
        writes = fixture.bean(CrmOpportunityWriteService.class);
        transactions = fixture.bean(TransactionTemplate.class);
    }

    static void run(CrmOperationsDatabaseChecks fixture) throws Exception {
        int before = assertionCount();
        identity();
        CrmPerformanceDatabaseChecks checks = new CrmPerformanceDatabaseChecks(fixture);
        try {
            checks.setup();
            checks.crossMonth();
            checks.sameMonthAndZero();
            checks.actualAmountsAndBaselines();
            checks.outstanding();
            checks.permissionsAndValidation();
        } finally {
            identity();
            for (Long identifier : List.of(FIRST, SECOND, THIRD)) fixture.employeeDirectory.remove(identifier);
        }
        System.out.println("H3_PERFORMANCE_DATABASE_CHECKS: assertions=" + (assertionCount() - before)
                + "; failed=0; four_queries=true; actual_win_restore=true; cross_month=true; mysql=true; scope=controlled_identity; real_http=false; production_modified=false");
    }

    private void setup() {
        for (Long department : List.of(FIRST_DEPT, SECOND_DEPT, THIRD_DEPT)) {
            fixture.jdbc.update("INSERT INTO sys_dept(dept_id,tenant_id,dept_name,status,deleted) VALUES (?,100000,?,'0',0)",
                    department, "业绩验证部门" + department);
        }
        for (Long identifier : List.of(FIRST, SECOND, THIRD)) {
            Long department = identifier.equals(FIRST) ? FIRST_DEPT : identifier.equals(SECOND) ? SECOND_DEPT : THIRD_DEPT;
            fixture.jdbc.update("INSERT INTO sys_user(user_id,tenant_id,dept_id,user_name,nick_name,status,deleted) VALUES (?,100000,?,?,?,'0',0)",
                    identifier, department, "h3_performance_" + identifier, "业绩验证" + identifier);
            HrEmployeeSummaryVO employee = fixture.employee(identifier);
            employee.setDeptId(department);
            fixture.employeeDirectory.put(identifier, employee);
        }
        customer = fixture.customer(label);
        customer.setOwnerId(FIRST);
        customer.setDeptId(FIRST_DEPT);
        fixture.mapper(CrmCustomerMapper.class).updateById(customer);
    }

    private CrmPerformanceSummaryVO owner(Long identifier, LocalDate month, String currency) {
        return row(performance.summarizeByOwner(List.of(identifier), month.toString(), month.plusMonths(1).minusDays(1).toString(), "TEAM_V2", currency), identifier);
    }

    private CrmPerformanceSummaryVO department(Long identifier, LocalDate month, String currency) {
        return row(performance.summarizeByDept(List.of(identifier), month.toString(), month.plusMonths(1).minusDays(1).toString(), "TEAM_V2", currency), identifier);
    }

    private CrmPerformanceSummaryVO row(List<CrmPerformanceSummaryVO> rows, Long identifier) {
        return rows.stream().filter(value -> identifier.equals(value.getTargetId())).findFirst().orElseThrow();
    }

    private CrmOpportunity read(Long identifier) {
        return fixture.mapper(CrmOpportunityMapper.class).selectById(identifier);
    }

    private CrmOpportunity win(Long identifier) {
        identity(100000L, FIRST, 0);
        try {
            return writes.win(identifier, null, read(identifier).getVersion());
        } finally {
            identity();
        }
    }

    private void team(CrmOpportunity opportunity, String firstShare) {
        CrmOpportunity current = read(opportunity.getOpportunityId());
        fixture.bean(CrmOpportunityTeamService.class).save(current.getOpportunityId(),
                new CrmDealTeamRequest(current.getTeamVersion(), current.getVersion(),
                        List.of(new CrmDealTeamRequest.Member(FIRST, "OWNER", new BigDecimal(firstShare)),
                                new CrmDealTeamRequest.Member(SECOND, "CO_SELLER", BigDecimal.ONE.subtract(new BigDecimal(firstShare)))),
                        "业绩查询验证中调整当前团队"));
    }

    private List<CrmDealAllocation> allocations(Long eventId) {
        return fixture.mapper(CrmDealAllocationMapper.class).selectList(new LambdaQueryWrapper<CrmDealAllocation>()
                .eq(CrmDealAllocation::getEventId, eventId).orderByAsc(CrmDealAllocation::getSalesUserId));
    }

    private void crossMonth() throws Exception {
        CrmOpportunity input = new CrmOpportunity();
        input.setCustomerId(customer.getCustomerId());
        input.setOpportunityName(label);
        input.setOwnerId(FIRST);
        input.setExpectedAmount(new BigDecimal("10000.01"));
        input.setExpectedSignDate(LocalDate.now().plusDays(7));
        fixture.bean(CrmOpportunityServiceImpl.class).createOpportunity(input);
        team(input, "0.6000");
        CrmOpportunity won = win(input.getOpportunityId());
        Long originalId = reopening.inspect(won.getOpportunityId()).winningEventId();
        LocalDateTime historicalTime = PRIOR.plusDays(14).atTime(10, 0);
        transactions.executeWithoutResult(status -> {
            fixture.jdbc.update("UPDATE crm_opportunity SET stage_changed_time=? WHERE tenant_id=100000 AND opportunity_id=?", historicalTime, won.getOpportunityId());
            fixture.jdbc.update("UPDATE crm_opportunity_stage_history SET changed_time=? WHERE tenant_id=100000 AND opportunity_id=? AND to_stage='WON'", historicalTime, won.getOpportunityId());
            fixture.jdbc.update("UPDATE crm_deal_event SET occurred_time=? WHERE tenant_id=100000 AND event_id=?", historicalTime, originalId);
        });
        CrmDealEvent original = fixture.mapper(CrmDealEventMapper.class).selectById(originalId);
        String originalEvidence = fixture.json.writeValueAsString(original);
        String allocationEvidence = fixture.json.writeValueAsString(allocations(originalId));
        CrmPerformanceSummaryVO firstBefore = owner(FIRST, PRIOR, "CNY");
        CrmPerformanceSummaryVO secondBefore = owner(SECOND, PRIOR, "CNY");
        decimal("6000.01", firstBefore.getWonAmount(), "previous month owner gets original exact split");
        decimal("4000.00", secondBefore.getWonAmount(), "previous month partner gets original exact split");
        equal(1L, firstBefore.getWonOpportunityCount(), "previous month counts owner participation");
        decimal("0.6000", firstBefore.getAllocatedWonCount(), "previous month uses frozen weight");
        decimal("0.00", firstBefore.getContractAmount(), "winning does not fabricate a contract");
        String priorFirst = fixture.json.writeValueAsString(firstBefore);
        String priorSecond = fixture.json.writeValueAsString(secondBefore);
        String priorFirstDepartment = fixture.json.writeValueAsString(department(FIRST_DEPT, PRIOR, "CNY"));
        String priorSecondDepartment = fixture.json.writeValueAsString(department(SECOND_DEPT, PRIOR, "CNY"));
        fixture.employeeDirectory.get(FIRST).setDeptId(SECOND_DEPT);
        fixture.jdbc.update("UPDATE sys_user SET dept_id=? WHERE tenant_id=100000 AND user_id=?", SECOND_DEPT, FIRST);
        team(won, "0.2000");
        CrmOpportunityReopenRequest request = new CrmOpportunityReopenRequest(read(won.getOpportunityId()).getVersion(), "QUALIFIED", "本月撤回上月赢单");
        CrmOpportunityReopenService.Receipt receipt = reopening.restore(won.getOpportunityId(), request);
        equal(originalId, receipt.originalEventId(), "actual restore binds original winning event");
        equal(priorFirst, fixture.json.writeValueAsString(owner(FIRST, PRIOR, "CNY")), "later restore preserves all previous owner fields");
        equal(priorSecond, fixture.json.writeValueAsString(owner(SECOND, PRIOR, "CNY")), "later restore preserves all previous partner fields");
        equal(priorFirstDepartment, fixture.json.writeValueAsString(department(FIRST_DEPT, PRIOR, "CNY")), "staff transfer preserves previous department result");
        equal(priorSecondDepartment, fixture.json.writeValueAsString(department(SECOND_DEPT, PRIOR, "CNY")), "new team does not rewrite previous department result");
        CrmPerformanceSummaryVO firstAfter = owner(FIRST, CURRENT, "CNY");
        CrmPerformanceSummaryVO secondAfter = owner(SECOND, CURRENT, "CNY");
        decimal("-6000.01", firstAfter.getWonAmount(), "restore month reverses original owner amount");
        decimal("-4000.00", secondAfter.getWonAmount(), "restore month reverses original partner amount");
        equal(-1L, firstAfter.getWonOpportunityCount(), "restore month subtracts participation");
        decimal("-0.6000", firstAfter.getAllocatedWonCount(), "restore month subtracts original weight");
        decimal("-6000.01", department(FIRST_DEPT, CURRENT, "CNY").getWonAmount(), "restore uses frozen original department");
        equal(originalEvidence, fixture.json.writeValueAsString(fixture.mapper(CrmDealEventMapper.class).selectById(originalId)), "restore preserves original fact");
        equal(allocationEvidence, fixture.json.writeValueAsString(allocations(originalId)), "restore preserves original allocations");
        fails(IllegalArgumentException.class, () -> reopening.restore(won.getOpportunityId(), request), "duplicate actual restore cannot add another reversal");
        equal(1L, fixture.scalar("SELECT COUNT(*) FROM crm_deal_event WHERE tenant_id=100000 AND reversal_of_id=?", originalId), "one original event has one actual winning reversal");
        for (CrmPerformanceSummaryVO summary : performance.summarizeByOwner(List.of(FIRST, SECOND), PRIOR.toString(), CURRENT.plusMonths(1).minusDays(1).toString(), "TEAM_V2", "CNY")) {
            decimal("0.00", summary.getWonAmount(), "both months net to zero");
            equal(0L, summary.getWonOpportunityCount(), "both months participation nets to zero");
            decimal("0.0000", summary.getAllocatedWonCount(), "both months weight nets to zero");
        }
        identity(100000L, FIRST, 3);
        UserContext.setDsDeptIds(List.of(FIRST_DEPT, SECOND_DEPT));
        try {
            equal(fixture.json.writeValueAsString(firstAfter), fixture.json.writeValueAsString(row(performance.topOwners(10, CURRENT.toString(), CURRENT.plusMonths(1).minusDays(1).toString(), "TEAM_V2", "CNY"), FIRST)), "owner ranking shares identical scoped aggregate");
            equal(fixture.json.writeValueAsString(department(FIRST_DEPT, CURRENT, "CNY")), fixture.json.writeValueAsString(row(performance.topDepartments(10, CURRENT.toString(), CURRENT.plusMonths(1).minusDays(1).toString(), "TEAM_V2", "CNY"), FIRST_DEPT)), "department ranking shares identical scoped aggregate");
        } finally { identity(); }
        CrmOpportunity next = win(won.getOpportunityId());
        decimal("-4000.01", owner(FIRST, CURRENT, "CNY").getWonAmount(), "winning again uses new current team amount");
        decimal("4000.01", owner(SECOND, CURRENT, "CNY").getWonAmount(), "new partner amount offsets old reversal in current month");
        equal(0L, department(SECOND_DEPT, CURRENT, "CNY").getWonOpportunityCount(), "two members in same department count one new event");
        reopening.restore(next.getOpportunityId(), new CrmOpportunityReopenRequest(next.getVersion(), "QUALIFIED", "本月再次撤回"));
        decimal("-6000.01", owner(FIRST, CURRENT, "CNY").getWonAmount(), "same month second cycle nets to zero");
        equal(priorFirst, fixture.json.writeValueAsString(owner(FIRST, PRIOR, "CNY")), "repeated cycle still preserves original month");
    }

    private List<CrmDealPolicy.Member> single(Long identifier, Long department) {
        return List.of(new CrmDealPolicy.Member(identifier, identifier, "业绩验证" + identifier, department, "OWNER", new BigDecimal("1.0000"), null));
    }

    private CrmDealEvent append(String kind, String amount, String currency, LocalDateTime when, boolean baseline, List<CrmDealPolicy.Member> members) {
        String business = "WON".equals(kind) ? "OPPORTUNITY" : "CONTRACT".equals(kind) ? "CONTRACT" : "RECEIVABLE";
        String source = "CONTRACT".equals(kind) ? "cloudflow-service-oa" : "cloudflow-service-crm";
        return transactions.execute(status -> ledger.append(new CrmDealLedgerService.Fact(
                "PERFORMANCE:" + UUID.randomUUID(), kind, business, customer.getCustomerId(), customer.getCustomerId(),
                new BigDecimal(amount), currency, when, 1, source, 1,
                fixture.json.createObjectNode().put("fixture", label), baseline), members));
    }

    private CrmDealEvent reverse(CrmDealEvent original, LocalDateTime when) {
        String source = "CONTRACT".equals(original.getEventType()) ? "cloudflow-service-oa" : "cloudflow-service-crm";
        CrmDealLedgerService.Reversal request = new CrmDealLedgerService.Reversal(original.getEventId(),
                "PERFORMANCE:REVERSE:" + UUID.randomUUID(), when, source, 2, "业绩查询验证冲减",
                fixture.json.createObjectNode().put("fixture", label));
        CrmDealEvent reversal = transactions.execute(status -> ledger.reverse(request));
        equal(reversal.getEventId(), transactions.execute(status -> ledger.reverse(request)).getEventId(), "same reversal key returns same persisted event");
        return reversal;
    }

    private void sameMonthAndZero() {
        CrmDealEvent zero = append("WON", "0.00", "CNY", PRIOR.plusDays(2).atStartOfDay(), false, single(THIRD, THIRD_DEPT));
        reverse(zero, CURRENT.atStartOfDay());
        equal(1L, owner(THIRD, PRIOR, "CNY").getWonOpportunityCount(), "zero-amount winning still counts in original month");
        equal(-1L, owner(THIRD, CURRENT, "CNY").getWonOpportunityCount(), "zero-amount reversal still subtracts participation in current month");
        decimal("-1.0000", owner(THIRD, CURRENT, "CNY").getAllocatedWonCount(), "zero-amount reversal subtracts weight");
        decimal("0.00", owner(THIRD, CURRENT, "CNY").getWonAmount(), "zero-amount reversal retains exact zero money");
        LocalDate month = PRIOR.minusMonths(2);
        List<CrmDealPolicy.Member> members = List.of(
                new CrmDealPolicy.Member(FIRST, FIRST, "甲", FIRST_DEPT, "OWNER", new BigDecimal("0.5000"), null),
                new CrmDealPolicy.Member(SECOND, SECOND, "乙", FIRST_DEPT, "CO_SELLER", new BigDecimal("0.5000"), null));
        CrmDealEvent original = append("WON", "30.01", "CNY", month.plusDays(1).atStartOfDay(), false, members);
        equal(1L, department(FIRST_DEPT, month, "CNY").getWonOpportunityCount(), "same-department members count one opportunity");
        decimal("1.0000", department(FIRST_DEPT, month, "CNY").getAllocatedWonCount(), "department weights add exact member percentages");
        decimal("30.01", department(FIRST_DEPT, month, "CNY").getWonAmount(), "department money sums original members once");
        reverse(original, month.plusDays(3).atStartOfDay());
        equal(0L, department(FIRST_DEPT, month, "CNY").getWonOpportunityCount(), "same-month reversal removes one department participation");
        decimal("0.00", department(FIRST_DEPT, month, "CNY").getWonAmount(), "same-month money nets to zero");
        decimal("0.0000", department(FIRST_DEPT, month, "CNY").getAllocatedWonCount(), "same-month weights net to zero");
    }

    private void actualAmountsAndBaselines() throws Exception {
        LocalDate month = PRIOR.minusMonths(4);
        LocalDateTime when = month.plusDays(2).atStartOfDay();
        List<CrmDealPolicy.Member> members = single(THIRD, THIRD_DEPT);
        append("WON", "100.01", "CNY", when, false, members);
        append("CONTRACT", "60.03", "CNY", when, false, members);
        CrmDealEvent receipt = append("RECEIPT", "40.01", "CNY", when, false, members);
        append("WON", "9.01", "CNY", when, true, members);
        append("CONTRACT", "8.02", "CNY", when, true, members);
        append("RECEIPT", "7.03", "CNY", when, true, members);
        append("CONTRACT", "200.11", "USD", when, false, members);
        append("RECEIPT", "60.11", "USD", when, false, members);
        CrmPerformanceSummaryVO before = owner(THIRD, month, "CNY");
        decimal("100.01", before.getWonAmount(), "won metric uses actual won facts");
        decimal("60.03", before.getContractAmount(), "contract metric uses actual contract facts");
        decimal("40.01", before.getReceivedAmount(), "receipt metric uses actual receipt facts");
        equal(1L, before.getWonOpportunityCount(), "opening won snapshot is excluded from current earned count");
        decimal("9.01", before.getBaselineWonAmount(), "won opening snapshot is separate");
        decimal("8.02", before.getBaselineContractAmount(), "contract opening snapshot is separate");
        decimal("7.03", before.getBaselineReceivedAmount(), "receipt opening snapshot is separate");
        decimal("200.11", owner(THIRD, month, "USD").getContractAmount(), "contract currencies are separate");
        decimal("60.11", owner(THIRD, month, "USD").getReceivedAmount(), "receipt currencies are separate");
        decimal("0.00", owner(THIRD, month, "USD").getWonAmount(), "CNY winning never appears in USD");
        String previous = fixture.json.writeValueAsString(before);
        CrmDealLedgerService.Refund request = new CrmDealLedgerService.Refund(receipt.getEventId(),
                "PERFORMANCE:REFUND:" + UUID.randomUUID(), new BigDecimal("10.00"), month.plusMonths(1).atStartOfDay(), 2,
                "下一月部分退款", fixture.json.createObjectNode().put("fixture", label));
        CrmDealEvent refund = transactions.execute(status -> ledger.refund(request));
        equal(refund.getEventId(), transactions.execute(status -> ledger.refund(request)).getEventId(), "duplicate partial refund is idempotent");
        equal(previous, fixture.json.writeValueAsString(owner(THIRD, month, "CNY")), "following-month refund keeps original month's fields unchanged");
        decimal("-10.00", owner(THIRD, month.plusMonths(1), "CNY").getReceivedAmount(), "partial refund belongs to refund month");
        JsonNode json = fixture.json.valueToTree(before);
        for (String field : List.of("wonAmount", "contractAmount", "receivedAmount", "outstandingAmount",
                "baselineWonAmount", "baselineContractAmount", "baselineReceivedAmount", "allocatedWonCount")) {
            check(json.path(field).isTextual(), "exact amount is serialized as a string: " + field);
        }
        equal("TEAM_V2", before.getCalculationBasis(), "response explicitly identifies team basis");
        equal("CNY", before.getCurrency(), "response explicitly identifies currency");
    }

    private CrmReceivable receivable(Long ownerId, String planned, String received) {
        CrmReceivable row = fixture.receivable(customer, null, planned, received, LocalDate.now().plusDays(7));
        row.setOwnerId(ownerId);
        row.setOutstandingAmount(new BigDecimal(planned).subtract(new BigDecimal(received)));
        row.setReceivedDate(received.equals("0.00") ? null : LocalDate.now());
        fixture.mapper(CrmReceivableMapper.class).updateById(row);
        return row;
    }

    private CrmDealTeam currentShare(CrmReceivable receivable, Long identifier, Long department, String role, String percentage) {
        CrmDealTeam member = new CrmDealTeam();
        member.setTenantId(100000L);
        member.setBizType("RECEIVABLE");
        member.setBizId(receivable.getReceivableId());
        member.setTeamVersion(1);
        member.setCurrentFlag(1);
        member.setSalesUserId(identifier);
        member.setSalesUserName("业绩验证" + identifier);
        member.setDeptId(department);
        member.setRoleType(role);
        member.setAllocatedPercentage(new BigDecimal(percentage));
        member.setAllocatedAmount(BigDecimal.ZERO);
        CrmRecordSupport.create(member, "teamId");
        fixture.mapper(CrmDealTeamMapper.class).insert(member);
        return member;
    }

    private void outstanding() {
        CrmReceivable rounded = receivable(FIRST, "0.05", "0.00");
        CrmDealTeam first = currentShare(rounded, FIRST, SECOND_DEPT, "OWNER", "0.3334");
        CrmDealTeam second = currentShare(rounded, SECOND, SECOND_DEPT, "CO_SELLER", "0.3333");
        CrmDealTeam third = currentShare(rounded, THIRD, THIRD_DEPT, "SUPPORT", "0.3333");
        decimal("0.01", owner(FIRST, PRIOR, "CNY").getOutstandingAmount(), "current outstanding owner absorbs full-team cent remainder");
        decimal("0.02", owner(SECOND, PRIOR, "CNY").getOutstandingAmount(), "current outstanding partner retains rounded two cents");
        decimal("0.02", owner(THIRD, PRIOR, "CNY").getOutstandingAmount(), "current outstanding support retains rounded two cents");
        identity(100000L, FIRST, 4);
        try {
            List<CrmPerformanceSummaryVO> visible = performance.summarizeByOwner(List.of(FIRST, SECOND, THIRD), PRIOR.toString(), CURRENT.toString(), "TEAM_V2", "CNY");
            equal(1, visible.size(), "self scope hides other shares before aggregation");
            decimal("0.01", visible.get(0).getOutstandingAmount(), "self-only view keeps remainder calculated from all team members");
        } finally { identity(); }
        CrmReceivable unassigned = receivable(THIRD, "0.07", "0.00");
        decimal("0.09", owner(THIRD, PRIOR, "CNY").getOutstandingAmount(), "receivable without configured team belongs fully to owner");
        decimal("0.09", department(THIRD_DEPT, PRIOR, "CNY").getOutstandingAmount(), "fallback team uses actual owner department");
        decimal("0.01", owner(FIRST, PRIOR.minusYears(1), "CNY").getOutstandingAmount(), "current outstanding is not limited by past event dates");
        append("RECEIPT", "1000.00", "CNY", CURRENT.atStartOfDay(), false, single(FIRST, SECOND_DEPT));
        CrmReceivable invalid = receivable(THIRD, "0.05", "0.00");
        CrmDealTeam malformed = currentShare(invalid, THIRD, THIRD_DEPT, "OWNER", "0.9000");
        identity(100000L, FIRST, 3);
        UserContext.setDsDeptIds(List.of(FIRST_DEPT, SECOND_DEPT, THIRD_DEPT));
        try {
            fails(IllegalArgumentException.class, () -> performance.topOwners(1, CURRENT.toString(), CURRENT.plusMonths(1).minusDays(1).toString(), "TEAM_V2", "CNY"),
                    "bad visible share outside first ranked owner cannot be hidden by LIMIT");
            fails(IllegalArgumentException.class, () -> performance.topDepartments(1, CURRENT.toString(), CURRENT.plusMonths(1).minusDays(1).toString(), "TEAM_V2", "CNY"),
                    "bad visible share outside first ranked department cannot be hidden by LIMIT");
        } finally {
            identity();
            fixture.jdbc.update("UPDATE crm_deal_team SET allocated_percentage=1.0000 WHERE tenant_id=100000 AND team_id=?", malformed.getTeamId());
        }
        fixture.jdbc.update("UPDATE crm_receivable SET outstanding_amount=0.01 WHERE tenant_id=100000 AND receivable_id=?", rounded.getReceivableId());
        fixture.jdbc.update("UPDATE crm_deal_team SET allocated_percentage=0.0000 WHERE tenant_id=100000 AND team_id=?", first.getTeamId());
        fixture.jdbc.update("UPDATE crm_deal_team SET allocated_percentage=0.5000 WHERE tenant_id=100000 AND team_id IN (?,?)", second.getTeamId(), third.getTeamId());
        identity(100000L, FIRST, 4);
        try {
            fails(IllegalArgumentException.class, () -> owner(FIRST, CURRENT, "CNY"), "negative owner cent remainder fails even when partner shares are hidden");
        } finally {
            identity();
            fixture.jdbc.update("UPDATE crm_receivable SET outstanding_amount=0.05 WHERE tenant_id=100000 AND receivable_id=?", rounded.getReceivableId());
            fixture.jdbc.update("UPDATE crm_deal_team SET allocated_percentage=0.3334 WHERE tenant_id=100000 AND team_id=?", first.getTeamId());
            fixture.jdbc.update("UPDATE crm_deal_team SET allocated_percentage=0.3333 WHERE tenant_id=100000 AND team_id IN (?,?)", second.getTeamId(), third.getTeamId());
        }
        List<CrmPerformanceSummaryVO> legacy = performance.summarizeByOwner(List.of(THIRD), null, null, null, null);
        equal("OWNER_V1", row(legacy, THIRD).getCalculationBasis(), "API default explicitly preserves old owner basis");
        equal("CNY", row(legacy, THIRD).getCurrency(), "API default currency is CNY");
        decimal("0.12", row(legacy, THIRD).getOutstandingAmount(), "old basis assigns full current balances to owner");
        equal(0L, fixture.scalar("SELECT COUNT(*) FROM crm_deal_team WHERE tenant_id=100000 AND biz_type='RECEIVABLE' AND biz_id=?", unassigned.getReceivableId()), "query fallback does not manufacture team rows");
    }

    private void permissionsAndValidation() {
        identity(100000L, FIRST, 4);
        try {
            List<CrmPerformanceSummaryVO> owners = performance.summarizeByOwner(List.of(FIRST, SECOND), PRIOR.toString(), CURRENT.toString(), "TEAM_V2", "CNY");
            equal(1, owners.size(), "self cannot aggregate another employee");
            equal(FIRST, owners.get(0).getTargetId(), "self result belongs to trusted user");
            equal(0, performance.summarizeByOwner(List.of(SECOND), PRIOR.toString(), CURRENT.toString(), "TEAM_V2", "CNY").size(), "explicit foreign owner filter cannot widen self scope");
            decimal("6000.01", owner(FIRST, PRIOR, "CNY").getWonAmount(), "self previous-month value uses only own allocation");
        } finally { identity(); }
        identity(100000L, SECOND, 3);
        UserContext.setDsDeptIds(List.of(FIRST_DEPT));
        try {
            List<CrmPerformanceSummaryVO> departments = performance.summarizeByDept(List.of(FIRST_DEPT, SECOND_DEPT), PRIOR.toString(), CURRENT.toString(), "TEAM_V2", "CNY");
            equal(1, departments.size(), "department identity cannot aggregate another department");
            equal(FIRST_DEPT, departments.get(0).getTargetId(), "visible department remains the frozen source department");
        } finally { identity(); }
        identity(100001L, FIRST, 0);
        try {
            append("RECEIPT", "999.00", "CNY", CURRENT.atStartOfDay(), false, single(FIRST, FIRST_DEPT));
            decimal("999.00", owner(FIRST, CURRENT, "CNY").getReceivedAmount(), "same numeric user ID is isolated by actual tenant SQL");
        } finally { identity(); }
        decimal("1000.00", owner(FIRST, CURRENT, "CNY").getReceivedAmount(), "foreign tenant source cannot increase original tenant result");
        UserContext.setUserId(null);
        fails(ServiceException.class, () -> performance.topOwners(10, null, null, "TEAM_V2", "CNY"), "missing trusted identity cannot receive an unrestricted ranking");
        identity();
        for (int limit : List.of(-1, 0, 201)) {
            fails(IllegalArgumentException.class, () -> performance.topOwners(limit, null, null, "TEAM_V2", "CNY"), "invalid owner rank limit rejected");
            fails(IllegalArgumentException.class, () -> performance.topDepartments(limit, null, null, "TEAM_V2", "CNY"), "invalid department rank limit rejected");
        }
        for (String date : List.of("2026-02-29", "0001-01-01", "2026-2-01", "10000-01-01")) {
            fails(IllegalArgumentException.class, () -> performance.summarizeByOwner(List.of(FIRST), date, null, "TEAM_V2", "CNY"), "invalid calendar date rejected");
        }
        fails(IllegalArgumentException.class, () -> performance.summarizeByOwner(List.of(FIRST), CURRENT.toString(), PRIOR.toString(), "TEAM_V2", "CNY"), "reversed date range rejected");
        fails(IllegalArgumentException.class, () -> performance.summarizeByOwner(List.of(FIRST), null, null, "ALL", "CNY"), "invalid basis rejected");
        for (String currency : List.of("cny", "CNY,USD", "AA")) {
            fails(IllegalArgumentException.class, () -> performance.summarizeByOwner(List.of(FIRST), null, null, "TEAM_V2", currency), "invalid single-currency selection rejected");
        }
        List<Long> invalidIds = new ArrayList<>();
        invalidIds.add(null);
        fails(IllegalArgumentException.class, () -> performance.summarizeByOwner(invalidIds, null, null, "TEAM_V2", "CNY"), "null subject rejected");
        invalidIds.clear();
        for (long index = 1; index <= 201; index++) invalidIds.add(index);
        fails(IllegalArgumentException.class, () -> performance.summarizeByDept(invalidIds, null, null, "TEAM_V2", "CNY"), "more than 200 subjects rejected");
        fails(IllegalArgumentException.class, () -> performance.summarizeByOwner(List.of(0L), null, null, "TEAM_V2", "CNY"), "zero subject rejected");
        long eventsBefore = fixture.scalar("SELECT COUNT(*) FROM crm_deal_event");
        long allocationsBefore = fixture.scalar("SELECT COUNT(*) FROM crm_deal_allocation");
        performance.summarizeByOwner(List.of(FIRST), "1000-01-01", "9999-12-31", "TEAM_V2", "CNY");
        performance.summarizeByDept(List.of(FIRST_DEPT), null, null, "TEAM_V2", "DKK");
        performance.topOwners(200, null, null, "TEAM_V2", "CNY");
        performance.topDepartments(200, null, null, "TEAM_V2", "CNY");
        equal(eventsBefore, fixture.scalar("SELECT COUNT(*) FROM crm_deal_event"), "four query paths add no facts");
        equal(allocationsBefore, fixture.scalar("SELECT COUNT(*) FROM crm_deal_allocation"), "four query paths add no allocations");
    }
}
