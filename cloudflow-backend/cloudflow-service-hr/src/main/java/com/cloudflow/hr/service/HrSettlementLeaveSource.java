package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.hr.domain.entity.HrEarnedLeaveSchedule;
import com.cloudflow.hr.domain.entity.HrLeaveLedger;
import com.cloudflow.hr.domain.entity.HrLeavePeriod;
import com.cloudflow.hr.domain.entity.HrLeaveQuota;
import com.cloudflow.hr.domain.entity.HrLeaveType;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrEarnedLeaveScheduleMapper;
import com.cloudflow.hr.mapper.HrLeaveLedgerMapper;
import com.cloudflow.hr.mapper.HrLeavePeriodMapper;
import com.cloudflow.hr.mapper.HrLeaveQuotaMapper;
import com.cloudflow.hr.mapper.HrLeaveTypeMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/** Read-only leave quantities. Monetary valuation requires the separately confirmed severance policy. */
@Service
@RequiredArgsConstructor
public class HrSettlementLeaveSource {
    private final HrLeaveLedgerMapper ledger;
    private final HrLeaveQuotaMapper quotas;
    private final HrLeaveTypeMapper types;
    private final HrLeavePeriodMapper periods;
    private final HrEarnedLeaveScheduleMapper schedules;
    private final HrHSupport access;
    private final ObjectMapper json;

    public record Issue(Long leaveTypeId, Long periodId, String code, String message) { }
    public record Leave(Long quotaId, Long leaveTypeId, Long periodId, String quantity, String unit, JsonNode evidence) { }
    public record Inspection(List<Leave> leaves, List<Issue> issues) {
        public Inspection { leaves = List.copyOf(leaves); issues = List.copyOf(issues); }
    }
    private record Key(Long typeId, Long periodId) { }

    public Inspection inspect(Long employeeId, LocalDate relievingDate, Long settlementId) {
        access.permission("hr:settlement:calculate"); access.scope(employeeId);
        if (relievingDate == null || relievingDate.getYear() < 1000 || relievingDate.getYear() > 9999
                || settlementId != null && settlementId <= 0) throw HrHException.invalid("离职日期或结算单编号无效");
        List<HrLeaveLedger> entries = ledger.selectList(new LambdaQueryWrapper<HrLeaveLedger>()
                .eq(HrLeaveLedger::getTenantId, HrRuleSupport.tenantId()).eq(HrLeaveLedger::getEmployeeId, employeeId)
                .orderByAsc(HrLeaveLedger::getLedgerId));
        List<HrLeaveQuota> balances = quotas.selectList(new LambdaQueryWrapper<HrLeaveQuota>()
                .eq(HrLeaveQuota::getTenantId, HrRuleSupport.tenantId()).eq(HrLeaveQuota::getEmployeeId, employeeId)
                .eq(HrLeaveQuota::getDeleted, 0).orderByAsc(HrLeaveQuota::getId));
        List<HrEarnedLeaveSchedule> pending = schedules.selectList(new LambdaQueryWrapper<HrEarnedLeaveSchedule>()
                .eq(HrEarnedLeaveSchedule::getTenantId, HrRuleSupport.tenantId()).eq(HrEarnedLeaveSchedule::getEmployeeId, employeeId)
                .eq(HrEarnedLeaveSchedule::getExecutedFlag, 0).le(HrEarnedLeaveSchedule::getScheduleDate, relievingDate));
        Map<Key, List<HrLeaveLedger>> grouped = new LinkedHashMap<>(); Map<Key, HrLeaveQuota> cached = new LinkedHashMap<>();
        for (HrLeaveLedger entry : entries) grouped.computeIfAbsent(new Key(entry.getLeaveTypeId(), entry.getLeavePeriodId()), ignored -> new ArrayList<>()).add(entry);
        for (HrLeaveQuota balance : balances) {
            Key key = new Key(balance.getLeaveTypeId(), balance.getPeriodId()); cached.put(key, balance); grouped.computeIfAbsent(key, ignored -> new ArrayList<>());
        }
        for (HrEarnedLeaveSchedule schedule : pending) grouped.computeIfAbsent(new Key(schedule.getLeaveTypeId(), schedule.getLeavePeriodId()), ignored -> new ArrayList<>());
        List<Leave> leaves = new ArrayList<>(); List<Issue> issues = new ArrayList<>();
        for (Map.Entry<Key, List<HrLeaveLedger>> group : grouped.entrySet()) {
            Key key = group.getKey(); List<HrLeaveLedger> rows = group.getValue();
            try {
                HrLeaveType type = key.typeId() == null ? null : types.selectOne(new LambdaQueryWrapper<HrLeaveType>()
                        .eq(HrLeaveType::getTenantId, HrRuleSupport.tenantId()).eq(HrLeaveType::getId, key.typeId()));
                if (type == null) throw conflict("SETTLEMENT_LEAVE_TYPE_MISSING", "假期台账对应的本租户假期类型不存在");
                if (!Integer.valueOf(1).equals(type.getEncashmentFlag())) continue;
                if (!Integer.valueOf(1).equals(type.getStatus()) || !Integer.valueOf(1).equals(type.getNeedQuota())
                        || !List.of("DAY", "HOUR").contains(String.valueOf(type.getUnit())) || type.getVersion() == null || type.getVersion() < 0) {
                    throw conflict("SETTLEMENT_LEAVE_TYPE_INVALID", "可折现假期的额度、单位或启用状态尚未核定");
                }
                HrLeavePeriod period = key.periodId() == null ? null : periods.selectOne(new LambdaQueryWrapper<HrLeavePeriod>()
                        .eq(HrLeavePeriod::getTenantId, HrRuleSupport.tenantId()).eq(HrLeavePeriod::getPeriodId, key.periodId()).eq(HrLeavePeriod::getDeleted, 0));
                if (period == null || period.getVersion() == null || period.getVersion() < 0 || period.getStartDate() == null
                        || period.getEndDate() == null || period.getStartDate().isAfter(period.getEndDate())) {
                    throw conflict("SETTLEMENT_LEAVE_PERIOD_MISSING", "假期缺少有效所属周期");
                }
                if (period.getStartDate().isAfter(relievingDate)) continue;
                for (HrLeaveLedger entry : rows) {
                    quantity(entry.getLeaveDays());
                    if (!Objects.equals(entry.getQuantityUnit(), type.getUnit())) throw conflict("SETTLEMENT_LEAVE_UNIT_MISMATCH", "假期台账单位与当前假种不一致，请核实历史来源");
                    if (entry.getFromDate() != null && entry.getFromDate().isAfter(relievingDate)) throw conflict("SETTLEMENT_LEAVE_FUTURE_ENTRY", "假期台账含离职后才生效的记录，请先核定实际额度");
                }
                HrLeaveQuota actual = HrLeaveBusinessService.balanceFromLedger(rows);
                HrLeaveQuota cache = cached.get(key);
                if (cache == null || !same(cache.getTotalQuota(), actual.getTotalQuota()) || !same(cache.getUsedQuota(), actual.getUsedQuota())
                        || !same(cache.getFrozenQuota(), actual.getFrozenQuota()) || !same(cache.getAvailableQuota(), actual.getAvailableQuota())) {
                    throw conflict("SETTLEMENT_LEAVE_BALANCE_MISMATCH", "假期额度汇总与真实台账不一致，请先完成额度核对");
                }
                BigDecimal ownFrozen = ownFrozen(rows, settlementId, key);
                if (actual.getFrozenQuota().compareTo(ownFrozen) != 0) throw conflict("SETTLEMENT_LEAVE_RESERVED", "假期仍被请假或其他结算占用，请先处理相关来源");
                if (pending.stream().anyMatch(schedule -> Objects.equals(schedule.getLeaveTypeId(), key.typeId()) && Objects.equals(schedule.getLeavePeriodId(), key.periodId()))) {
                    throw conflict("SETTLEMENT_LEAVE_ACCRUAL_PENDING", "离职日前已有应执行的假期累计任务尚未入账");
                }
                BigDecimal available = quantity(actual.getAvailableQuota().add(ownFrozen));
                if (available.signum() < 0) throw conflict("SETTLEMENT_LEAVE_NEGATIVE", "假期剩余额度为负，请先核定处理方式");
                if (ownFrozen.signum() > 0 && ownFrozen.compareTo(available) != 0) throw conflict("SETTLEMENT_LEAVE_RESERVATION_CHANGED", "本结算已冻结的假期与当前剩余额度不一致");
                if (available.signum() == 0) continue;
                if (!"OPEN".equals(period.getStatus()) || period.getEndDate().isBefore(relievingDate)) {
                    throw conflict("SETTLEMENT_LEAVE_PERIOD_PENDING", "历史或已关闭假期周期仍有余额，请先完成结转或核实");
                }
                if (cache.getExpiryDate() != null && cache.getExpiryDate().isBefore(relievingDate)) {
                    throw conflict("SETTLEMENT_LEAVE_EXPIRY_PENDING", "假期额度已到期但仍有余额，请先处理到期记录");
                }
                List<HrLeaveLedger> withoutReservations = rows.stream().filter(entry -> !List.of("FREEZE", "UNFREEZE").contains(String.valueOf(entry.getTransactionType()))).toList();
                for (HrLeaveLedger entry : rows) {
                    if ("CARRY_FORWARD".equals(entry.getTransactionType()) && entry.getLeaveDays().signum() > 0
                            && entry.getToDate() != null && entry.getToDate().isBefore(relievingDate)
                            && HrLeaveBusinessService.remainingCredit(withoutReservations, entry.getLedgerId()).signum() > 0) {
                        throw conflict("SETTLEMENT_LEAVE_EXPIRY_PENDING", "结转假期已到期但尚未完成到期扣减");
                    }
                }
                ObjectNode evidence = json.createObjectNode();
                evidence.put("quotaId", cache.getId().toString()); evidence.put("leaveTypeId", type.getId().toString()); evidence.put("leaveTypeVersion", type.getVersion());
                evidence.put("leaveCode", type.getLeaveCode()); evidence.put("periodId", period.getPeriodId().toString()); evidence.put("periodVersion", period.getVersion());
                evidence.put("periodStart", period.getStartDate().toString()); evidence.put("periodEnd", period.getEndDate().toString());
                evidence.put("unit", type.getUnit()); evidence.put("total", actual.getTotalQuota().toPlainString()); evidence.put("used", actual.getUsedQuota().toPlainString());
                evidence.put("frozen", actual.getFrozenQuota().toPlainString()); evidence.put("available", available.toPlainString());
                if (cache.getExpiryDate() != null) evidence.put("expiryDate", cache.getExpiryDate().toString());
                ArrayNode facts = evidence.putArray("ledger");
                for (HrLeaveLedger entry : rows) facts.add(ledgerEvidence(entry));
                leaves.add(new Leave(cache.getId(), key.typeId(), key.periodId(), available.toPlainString(), type.getUnit(), evidence));
            } catch (HrHException invalid) {
                issues.add(new Issue(key.typeId(), key.periodId(), invalid.getCode(), invalid.getMessage()));
            } catch (HrBusinessException | IllegalArgumentException invalid) {
                issues.add(new Issue(key.typeId(), key.periodId(), "SETTLEMENT_LEAVE_LEDGER_INVALID", "假期台账数量、类型或冲正来源无效"));
            }
        }
        return new Inspection(leaves, issues);
    }

    private BigDecimal ownFrozen(List<HrLeaveLedger> rows, Long settlementId, Key key) {
        Map<String, BigDecimal> freezes = new LinkedHashMap<>(); Map<String, BigDecimal> releases = new LinkedHashMap<>();
        for (HrLeaveLedger row : rows) {
            if (!"HR_SETTLEMENT".equals(row.getSourceBizType()) || settlementId == null || !settlementId.toString().equals(row.getSourceBizId())) continue;
            if (List.of("FREEZE", "UNFREEZE").contains(String.valueOf(row.getTransactionType()))) {
                String prefix = "HR_SETTLEMENT:" + settlementId + ":LEAVE:" + key.typeId() + ":" + key.periodId() + ":R";
                String event = row.getSourceEventKey();
                if (event == null || !event.matches(java.util.regex.Pattern.quote(prefix) + "[0-9]{1,10}:" + row.getTransactionType()) || row.getReversalOfId() != null
                        || ("FREEZE".equals(row.getTransactionType()) ? row.getLeaveDays().signum() >= 0 : row.getLeaveDays().signum() <= 0)) {
                    throw conflict("SETTLEMENT_LEAVE_RESERVATION_INVALID", "本结算假期冻结或释放的来源记录不一致");
                }
                String cycle = event.substring(0, event.lastIndexOf(':'));
                Map<String, BigDecimal> target = "FREEZE".equals(row.getTransactionType()) ? freezes : releases;
                if (target.putIfAbsent(cycle, row.getLeaveDays().abs()) != null) throw conflict("SETTLEMENT_LEAVE_RESERVATION_INVALID", "本结算存在重复的假期冻结或释放事件");
            }
        }
        for (Map.Entry<String, BigDecimal> release : releases.entrySet()) {
            if (!same(freezes.get(release.getKey()), release.getValue())) throw conflict("SETTLEMENT_LEAVE_RESERVATION_INVALID", "假期释放数量与原冻结事件不一致");
        }
        BigDecimal frozen = BigDecimal.ZERO; int active = 0;
        for (Map.Entry<String, BigDecimal> freeze : freezes.entrySet()) {
            if (!releases.containsKey(freeze.getKey())) { frozen = frozen.add(freeze.getValue()); active++; }
        }
        if (active > 1) throw conflict("SETTLEMENT_LEAVE_RESERVATION_INVALID", "本结算存在多个尚未释放的假期冻结批次");
        return quantity(frozen);
    }

    private ObjectNode ledgerEvidence(HrLeaveLedger entry) {
        ObjectNode node = json.createObjectNode(); node.put("ledgerId", entry.getLedgerId().toString()); node.put("type", entry.getTransactionType());
        node.put("quantity", entry.getLeaveDays().toPlainString()); node.put("unit", entry.getQuantityUnit());
        node.put("sourceBizType", entry.getSourceBizType()); node.put("sourceBizId", entry.getSourceBizId()); node.put("sourceEventKey", entry.getSourceEventKey());
        if (entry.getReversalOfId() != null) node.put("reversalOfId", entry.getReversalOfId().toString());
        if (entry.getFromDate() != null) node.put("fromDate", entry.getFromDate().toString());
        if (entry.getToDate() != null) node.put("toDate", entry.getToDate().toString());
        return node;
    }

    private static BigDecimal quantity(BigDecimal value) {
        if (value == null || value.abs().compareTo(new BigDecimal("999999.99")) > 0) throw new IllegalArgumentException();
        try { return value.setScale(2, RoundingMode.UNNECESSARY); }
        catch (ArithmeticException invalid) { throw new IllegalArgumentException(invalid); }
    }
    private static boolean same(BigDecimal first, BigDecimal second) { return first != null && quantity(first).compareTo(quantity(second)) == 0; }
    private static HrHException conflict(String code, String message) { return HrHException.conflict(code, message); }
}
