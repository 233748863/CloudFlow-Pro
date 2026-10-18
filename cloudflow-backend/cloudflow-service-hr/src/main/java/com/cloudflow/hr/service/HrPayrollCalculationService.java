package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.holiday.api.HolidayCalendarService;
import com.cloudflow.hr.domain.entity.*;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import static com.cloudflow.hr.service.HrRuleSupport.*;

@Service
@RequiredArgsConstructor
public class HrPayrollCalculationService {
    private final HrLeaveEncashmentComponentService encashmentComponents;
    private final HrRuleSupport support;
    private final HrPayrollConfigurationService configuration;
    private final HrEmployeeCompMapper compMapper;
    private final HrCompStructureMapper structureMapper;
    private final HrCompChangeMapper changeMapper;
    private final HrTaxProfileMapper profileMapper;
    private final HrTaxDeductionMapper deductionMapper;
    private final HrSalarySlipMapper slipMapper;
    private final HrPayrollBatchMapper batchMapper;
    private final HrPayrollCorrectionMapper correctionMapper;
    private final HrAttendanceRecordMapper attendanceMapper;
    private final HrAttendanceMonthlyMapper monthlyMapper;
    private final HrTimeRequestMapper requestMapper;
    private final HrLeaveTypeMapper leaveTypeMapper;
    private final HrLeavePeriodMapper leavePeriodMapper;
    private final HrLeaveQuotaMapper quotaMapper;
    private final HolidayCalendarService calendarService;
    private final HrLeaveDayCalculator dayCalculator;
    private final HrHMapper hMapper;
    private final HrOvertimeRequestMapper overtimeMapper;
    private final HrHCipherService hCipher;
    private final HrOvertimeTypeService overtimeTypes;
    private final HrAdvancePayrollService advancePayroll;
    private final HrReferralBonusService referralBonus;
    private final HrCommissionService commissions;

    public <T> T withGenerationLocks(Long employeeId, HrPayrollPeriod period, java.util.function.Supplier<T> action) {
        List<String> resources = new ArrayList<>(); resources.add("attendance-config");
        if (period.getPeriodId() != null) resources.add("payroll-period:" + period.getPeriodId());
        resources.add("payroll-year:" + employeeId + ":" + period.getEndDate().getYear());
        for (YearMonth month = YearMonth.from(period.getStartDate()); !month.isAfter(YearMonth.from(period.getEndDate())); month = month.plusMonths(1)) resources.add("attendance:" + employeeId + ":" + month);
        return generationLock(resources, 0, () -> {
            if (period.getPeriodId() != null) hMapper.payrollPeriodLocked(tenantId(), period.getPeriodId());
            return advancePayroll.withEmployeeLocks(List.of(employeeId), action);
        });
    }

    private <T> T generationLock(List<String> resources, int index, java.util.function.Supplier<T> action) {
        return index == resources.size() ? action.get() : support.locked(resources.get(index), () -> generationLock(resources, index + 1, action));
    }

    public HrEmployeeComp compensation(Long employeeId, LocalDate date) {
        List<HrEmployeeComp> rows = compMapper.selectPage(new Page<>(1, 1, false), new LambdaQueryWrapper<HrEmployeeComp>()
                .eq(HrEmployeeComp::getTenantId, tenantId()).eq(HrEmployeeComp::getEmployeeId, employeeId)
                .eq(HrEmployeeComp::getDeleted, 0).eq(HrEmployeeComp::getStatus, "ACTIVE")
                .le(HrEmployeeComp::getEffectiveDate, date).orderByDesc(HrEmployeeComp::getEffectiveDate).orderByDesc(HrEmployeeComp::getId)).getRecords();
        if (rows.isEmpty()) throw new HrBusinessException("COMPENSATION_MISSING", "未分配生效薪资结构");
        HrEmployeeComp comp = rows.get(0);
        HrCompStructure structure = comp.getStructureId() == null ? null : structureMapper.selectById(comp.getStructureId());
        if (structure == null || !Objects.equals(structure.getTenantId(), tenantId()) || !Integer.valueOf(1).equals(structure.getStatus())
                || comp.getTotalSalary() == null || comp.getTotalSalary().signum() < 0) throw new HrBusinessException("COMPENSATION_INVALID", "薪资结构未启用或薪资金额无效");
        return comp;
    }

    public HrTaxSlab taxSlab(Long employeeId, LocalDate date) {
        List<HrTaxProfile> profiles = profileMapper.selectList(new LambdaQueryWrapper<HrTaxProfile>()
                .eq(HrTaxProfile::getTenantId, tenantId()).eq(HrTaxProfile::getEmployeeId, employeeId).eq(HrTaxProfile::getStatus, "ACTIVE"));
        if (profiles.size() != 1) throw new HrBusinessException("TAX_PROFILE_MISSING", "须配置唯一的生效个税档案");
        HrTaxSlab slab = configuration.slab(profiles.get(0).getTaxSlabId());
        if (!"ACTIVE".equals(slab.getStatus()) || date.isBefore(slab.getEffectiveFrom())
                || slab.getEffectiveTo() != null && date.isAfter(slab.getEffectiveTo())) throw new HrBusinessException("TAX_TABLE_PENDING", HrPayrollTaxCalculator.PENDING_RATE_MESSAGE);
        List<HrTaxSlabDetail> details = configuration.details(slab.getSlabId());
        if (details.size() != 7) throw new HrBusinessException("TAX_TABLE_PENDING", "正式税率表须配置完整7档税率");
        HrPayrollTaxCalculator.validate(brackets(details));
        return slab;
    }

    public com.fasterxml.jackson.databind.JsonNode basis(HrEmployeeComp comp) {
        HrCompStructure structure = structureMapper.selectById(comp.getStructureId());
        return structure != null && structure.getComponentConfig() != null ? structure.getComponentConfig().path("payrollBasis")
                : com.fasterxml.jackson.databind.node.MissingNode.getInstance();
    }

    public PayrollBase baseCompensation(HrEmployeeComp comp, HrPayrollPeriod period) {
        HrEmployee employee = support.employee(comp.getEmployeeId());
        LocalDate eligibleStart = employee.getHireDate() != null && employee.getHireDate().isAfter(period.getStartDate())
                ? employee.getHireDate() : period.getStartDate();
        if (eligibleStart.isAfter(period.getEndDate())) throw new HrBusinessException("PAYROLL_EMPLOYEE_NOT_HIRED", "员工在本周期结束时尚未入职");
        if (comp.getEffectiveDate() != null && comp.getEffectiveDate().isAfter(eligibleStart)) {
            throw new HrBusinessException("PAYROLL_COMPENSATION_CHANGED", "周期内薪资结构发生变更，请拆分周期或先核定本期薪资结构");
        }
        com.fasterxml.jackson.databind.JsonNode policy = basis(comp);
        boolean fullMonth = period.getStartDate().equals(YearMonth.from(period.getEndDate()).atDay(1))
                && period.getEndDate().equals(YearMonth.from(period.getEndDate()).atEndOfMonth()) && eligibleStart.equals(period.getStartDate());
        if (!fullMonth && (!policy.hasNonNull("salaryBasis") || !policy.hasNonNull("prorationBasis") || !policy.hasNonNull("benefitTiming"))) {
            throw new HrBusinessException("PAYROLL_BASIS_REQUIRED", "分期或中途入职算薪须先在薪资结构中核定金额口径、分摊方式与社保扣除时点");
        }
        String salaryBasis = policy.path("salaryBasis").asText("MONTHLY");
        String prorationBasis = policy.path("prorationBasis").asText("WORKDAYS");
        if (!List.of("MONTHLY", "PER_PERIOD").contains(salaryBasis)
                || !List.of("WORKDAYS", "CALENDAR_DAYS").contains(prorationBasis)
                || !List.of("FIRST_PAYROLL", "LAST_PAYROLL").contains(policy.path("benefitTiming").asText("FIRST_PAYROLL"))) {
            throw new HrBusinessException("PAYROLL_BASIS_INVALID", "薪资结构的计薪口径配置无效");
        }
        BigDecimal gross = BigDecimal.ZERO;
        List<Map<String, Object>> monthlyPortions = new ArrayList<>();
        if (fullMonth) {
            gross = amount(comp.getTotalSalary());
            monthlyPortions.add(monthPortion(period.getStartDate(), period.getEndDate(), 0, 1, 1, gross));
        } else {
            long periodUnits = "PER_PERIOD".equals(salaryBasis)
                    ? payrollUnits(employee.getId(), period.getStartDate(), period.getEndDate(), prorationBasis) : 0;
            long previousPeriodUnits = 0;
            for (YearMonth month = YearMonth.from(eligibleStart); !month.isAfter(YearMonth.from(period.getEndDate())); month = month.plusMonths(1)) {
                LocalDate from = eligibleStart.isAfter(month.atDay(1)) ? eligibleStart : month.atDay(1);
                LocalDate to = period.getEndDate().isBefore(month.atEndOfMonth()) ? period.getEndDate() : month.atEndOfMonth();
                LocalDate earnedFrom = employee.getHireDate() != null && employee.getHireDate().isAfter(month.atDay(1)) ? employee.getHireDate() : month.atDay(1);
                long previous = "PER_PERIOD".equals(salaryBasis) ? previousPeriodUnits
                        : payrollUnits(employee.getId(), earnedFrom, from.minusDays(1), prorationBasis);
                long current = payrollUnits(employee.getId(), from, to, prorationBasis);
                long total = "PER_PERIOD".equals(salaryBasis) ? periodUnits
                        : payrollUnits(employee.getId(), month.atDay(1), month.atEndOfMonth(), prorationBasis);
                BigDecimal portion = HrPayrollProration.portion(comp.getTotalSalary(), previous, current, total);
                monthlyPortions.add(monthPortion(from, to, previous, current, total, portion));
                gross = gross.add(portion); previousPeriodUnits += current;
            }
        }
        Map<String, Object> snapshot = new LinkedHashMap<>(Map.of("name", "计薪口径快照", "type", "PAYROLL_BASIS", "amount", BigDecimal.ZERO,
                "salaryBasis", salaryBasis, "prorationBasis", prorationBasis,
                "benefitTiming", policy.path("benefitTiming").asText("FIRST_PAYROLL"), "configuredSalary", amount(comp.getTotalSalary()),
                "eligibleStart", eligibleStart.toString(), "periodEnd", period.getEndDate().toString()));
        snapshot.put("evidenceVersion", 2); snapshot.put("periodStart", period.getStartDate().toString());
        snapshot.put("fullMonth", fullMonth); snapshot.put("postedFixedGross", amount(gross)); snapshot.put("monthlyPortions", monthlyPortions);
        snapshot.put("componentAllocation", "PROPORTIONAL_POSTED_FIXED_GROSS");
        return new PayrollBase(amount(gross), snapshot);
    }

    private static Map<String, Object> monthPortion(LocalDate from, LocalDate to, long previous, long current, long total, BigDecimal gross) {
        return Map.of("month", YearMonth.from(from).toString(), "from", from.toString(), "to", to.toString(),
                "previousUnits", previous, "currentUnits", current, "totalUnits", total, "postedGross", gross);
    }

    private long payrollUnits(Long employeeId, LocalDate from, LocalDate to, String basis) {
        if (from.isAfter(to)) return 0;
        if ("CALENDAR_DAYS".equals(basis)) return ChronoUnit.DAYS.between(from, to) + 1;
        if (!"WORKDAYS".equals(basis)) throw new HrBusinessException("PAYROLL_BASIS_INVALID", "薪资分摊方式无效");
        long count = 0;
        for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1)) {
            if (calendarService.isWorkday(calendarService.resolveCalendarId(employeeId, date), date)) count++;
        }
        return count;
    }

    public record PayrollBase(BigDecimal gross, Map<String, Object> snapshot) {}

    public String preCheck(Long employeeId, HrPayrollPeriod period, boolean validateAttendance) {
        try {
            support.assertEmployeeScope(employeeId);
            configuration.assertOpen(period);
            if (hMapper.pendingPayroll(tenantId(), period.getPeriodId(), employeeId) > 0) throw new HrBusinessException("OVERTIME_SETTLEMENT_PENDING", "本工资周期存在尚未结清的加班费申请");
            HrEmployee employee = support.employee(employeeId);
            if (List.of("RESIGNED", "TERMINATED", "LEFT").contains(String.valueOf(employee.getEmployeeStatus()))
                    || employee.getResignDate() != null && !employee.getResignDate().isAfter(period.getEndDate())) throw new HrBusinessException("EMPLOYEE_RESIGNED", "已离职员工须走离职结算");
            if (employee.getHireDate() != null && employee.getHireDate().isAfter(period.getEndDate())) throw new HrBusinessException("EMPLOYEE_NOT_STARTED", "员工尚未入职");
            baseCompensation(compensation(employeeId, period.getEndDate()), period);
            taxSlab(employeeId, period.getEndDate());
            for (HrPayrollCorrection correction : correctionMapper.selectList(new LambdaQueryWrapper<HrPayrollCorrection>()
                    .eq(HrPayrollCorrection::getTenantId, tenantId()).eq(HrPayrollCorrection::getStatus, "PENDING").eq(HrPayrollCorrection::getDeleted, 0))) {
                HrSalarySlip pending = correction.getCorrectionSlipId() == null ? null : slipMapper.selectById(correction.getCorrectionSlipId());
                if (pending != null && Objects.equals(pending.getEmployeeId(), employeeId)
                        && YearMonth.parse(pending.getPeriodMonth()).getYear() == period.getEndDate().getYear()) {
                    throw new HrBusinessException("PAYROLL_CORRECTION_PENDING", "该员工有待审批工资补正，请先完成审批");
                }
            }
            if (requestMapper.selectCount(new LambdaQueryWrapper<HrTimeRequest>().eq(HrTimeRequest::getTenantId, tenantId())
                    .eq(HrTimeRequest::getEmployeeId, employeeId).eq(HrTimeRequest::getDeleted, 0).eq(HrTimeRequest::getRequestType, "LEAVE")
                    .in(HrTimeRequest::getStatus, List.of("PENDING", "SUBMITTED", "APPROVING", "APPLYING"))
                    .lt(HrTimeRequest::getStartTime, period.getEndDate().plusDays(1).atStartOfDay()).gt(HrTimeRequest::getEndTime, period.getStartDate().atStartOfDay())) > 0) {
                throw new HrBusinessException("LEAVE_PENDING", "本期请假审批尚未完成");
            }
            List<Long> pendingPeriods = leavePeriodMapper.selectList(new LambdaQueryWrapper<HrLeavePeriod>().eq(HrLeavePeriod::getTenantId, tenantId())
                    .eq(HrLeavePeriod::getDeleted, 0).ne(HrLeavePeriod::getStatus, "CLOSED").lt(HrLeavePeriod::getEndDate, period.getStartDate()))
                    .stream().map(HrLeavePeriod::getPeriodId).toList();
            if (!pendingPeriods.isEmpty() && quotaMapper.selectCount(new LambdaQueryWrapper<HrLeaveQuota>().eq(HrLeaveQuota::getTenantId, tenantId())
                    .eq(HrLeaveQuota::getEmployeeId, employeeId).eq(HrLeaveQuota::getDeleted, 0).in(HrLeaveQuota::getPeriodId, pendingPeriods)) > 0) {
                throw new HrBusinessException("LEAVE_CARRY_FORWARD_PENDING", "上期假期未完成结转");
            }
            if (validateAttendance) assertAttendanceComplete(employee, period);
            return null;
        } catch (HrBusinessException failure) {
            return failure.getMessage();
        }
    }

    public void assertAttendanceComplete(HrEmployee employee, HrPayrollPeriod period) {
        for (YearMonth month = YearMonth.from(period.getStartDate()); !month.isAfter(YearMonth.from(period.getEndDate())); month = month.plusMonths(1)) {
            if (monthlyMapper.selectCount(new LambdaQueryWrapper<HrAttendanceMonthly>().eq(HrAttendanceMonthly::getTenantId, tenantId())
                    .eq(HrAttendanceMonthly::getEmployeeId, employee.getId()).eq(HrAttendanceMonthly::getYear, month.getYear())
                    .eq(HrAttendanceMonthly::getMonth, month.getMonthValue()).eq(HrAttendanceMonthly::getStatus, "CONFIRMED")) != 1) {
                throw new HrBusinessException("ATTENDANCE_NOT_CLOSED", month + "考勤未封账");
            }
        }
        Map<LocalDate, HrAttendanceRecord> records = attendance(employee.getId(), period);
        for (LocalDate date = period.getStartDate(); !date.isAfter(period.getEndDate()); date = date.plusDays(1)) {
            if (employee.getHireDate() != null && date.isBefore(employee.getHireDate())) continue;
            if (calendarService.isWorkday(calendarService.resolveCalendarId(employee.getId(), date), date)) {
                HrAttendanceRecord record = records.get(date);
                if (record == null || "PENDING".equals(record.getStatus())) throw new HrBusinessException("ATTENDANCE_INCOMPLETE", "工作日考勤未齐备：" + date);
            }
        }
    }

    public List<HrSalarySlip> employeeSlips(Long employeeId) {
        return slipMapper.selectList(new LambdaQueryWrapper<HrSalarySlip>().eq(HrSalarySlip::getTenantId, tenantId())
                .eq(HrSalarySlip::getEmployeeId, employeeId).eq(HrSalarySlip::getDeleted, 0)
                .ne(HrSalarySlip::getStatus, "CANCELLED").orderByAsc(HrSalarySlip::getPeriodMonth).orderByAsc(HrSalarySlip::getId));
    }

    public void assertNoOverlappingSlip(Long employeeId, HrPayrollPeriod period, Long batchId) {
        Set<Long> corrections = correctionSlipIds();
        for (HrSalarySlip existing : employeeSlips(employeeId)) {
            if (corrections.contains(existing.getId())) continue;
            DateRange range = range(existing);
            if (!range.end().isBefore(period.getStartDate()) && !range.start().isAfter(period.getEndDate())
                    && (batchId == null || !Objects.equals(batchId, existing.getBatchId()))) {
                throw new HrBusinessException("PAYROLL_ALREADY_CALCULATED", "该员工本期已有工资单，不能重复计算");
            }
            if (range.start().isAfter(period.getEndDate())) throw new HrBusinessException("PAYROLL_CHRONOLOGY", "后续周期已有工资单，历史差额须走补正");
        }
    }

    public void apply(HrSalarySlip slip, HrPayrollPeriod period, boolean deductUnverified) {
        referralBonus.requireReady(slip.getEmployeeId(), period.getPeriodId());
        commissions.requireReady(slip.getEmployeeId(), period.getPeriodId());
        if (hMapper.pendingPayroll(tenantId(), period.getPeriodId(), slip.getEmployeeId()) > 0) throw new HrBusinessException("OVERTIME_SETTLEMENT_PENDING", "加班费尚未完成结算，不能生成工资");
        HrEmployee employee = support.employee(slip.getEmployeeId());
        HrTaxSlab slab = taxSlab(employee.getId(), period.getEndDate());
        List<HrTaxSlabDetail> details = configuration.details(slab.getSlabId());
        List<Map<String, Object>> components = new ArrayList<>(slip.getComponents() == null ? List.of() : slip.getComponents());
        components.removeIf(row -> "个人所得税".equals(row.get("name")) || "TAX_SNAPSHOT".equals(row.get("type")));
        BigDecimal variable = BigDecimal.ZERO;
        for (HrCompChange change : changeMapper.selectList(new LambdaQueryWrapper<HrCompChange>().eq(HrCompChange::getTenantId, tenantId())
                .eq(HrCompChange::getEmployeeId, employee.getId()).eq(HrCompChange::getDeleted, 0).eq(HrCompChange::getStatus, "APPROVED")
                .and(selection -> selection.and(source -> source.in(HrCompChange::getSourceBizType, List.of("HR_OVERTIME", "HR_REFERRAL", "CRM_COMMISSION")).eq(HrCompChange::getPayrollPeriodId, period.getPeriodId()))
                        .or(ordinary -> ordinary.and(source -> source.isNull(HrCompChange::getSourceBizType).or().notIn(HrCompChange::getSourceBizType, List.of("HR_OVERTIME", "HR_REFERRAL", "CRM_COMMISSION")))
                                .between(HrCompChange::getEffectiveDate, period.getStartDate(), period.getEndDate())))
                .in(HrCompChange::getChangeType, List.of("BONUS", "OVERTIME", "REFERRAL_BONUS", "LEAVE_ENCASHMENT")))) {
            BigDecimal value = amount(change.getChangeAmount());
            Map<String, Object> component = new LinkedHashMap<>(); component.put("name", change.getChangeType()); component.put("type", "EARNING"); component.put("amount", value); component.put("changeId", change.getId());
            component.put("sourceType", "COMPENSATION_CHANGE"); component.put("changeVersion", change.getVersion());
            if (change.getEffectiveDate() != null) component.put("effectiveDate", change.getEffectiveDate().toString());
            if ("LEAVE_ENCASHMENT".equals(change.getChangeType())) {
                component.putAll(encashmentComponents.payrollIdentity(change.getSalaryComponentId()));
            }
            if ("HR_REFERRAL".equals(change.getSourceBizType())) {
                referralBonus.validatePayroll(change, employee.getId(), period.getPeriodId());
                component.put("sourceBizType", "HR_REFERRAL"); component.put("referralId", change.getSourceBizId());
                component.put("salaryComponentId", change.getSalaryComponentId().toString());
            }
            if ("CRM_COMMISSION".equals(change.getSourceBizType())) {
                commissions.validatePayroll(change, employee.getId(), period.getPeriodId());
                component.putAll(commissions.payrollIdentity(change));
            }
            if ("HR_OVERTIME".equals(change.getSourceBizType())) {
                HrOvertimeRequest source = overtimeMapper.selectById(HrHSupport.number(change.getSourceBizId()));
                if (source == null || !Objects.equals(source.getTenantId(), tenantId()) || flag(source.getDeleted()) || !"APPROVED".equals(source.getStatus())
                        || !"SETTLED".equals(source.getSettlementStatus()) || !"PAY".equals(source.getSettleMode()) || !Objects.equals(source.getEmployeeId(), employee.getId())
                        || !Objects.equals(source.getCompChangeId(), change.getId()) || !Objects.equals(source.getPayrollPeriodId(), period.getPeriodId())
                        || !Objects.equals(source.getSalaryComponentId(), change.getSalaryComponentId()) || !"CNY".equals(source.getCurrency())
                        || value.compareTo(new BigDecimal(hCipher.open(source.getSettlementAmountCipher()))) != 0) throw new HrBusinessException("OVERTIME_SOURCE_CONFLICT", "加班费来源、金额或指定工资周期不一致");
                overtimeTypes.component(source.getSalaryComponentId()); component.put("overtimeRequestId", source.getRequestId().toString());
                component.put("sourceBizType", "HR_OVERTIME");
                component.put("salaryComponentId", source.getSalaryComponentId().toString()); component.put("approvedMinutes", source.getApprovedMinutes()); component.put("rateMultiplier", source.getRateMultiplier());
            }
            variable = variable.add(value);
            components.add(component);
        }
        PayrollDeductions deductions = payrollDeductions(employee.getId(), period);
        components.add(Map.of("name", "考勤扣款", "type", "DEDUCTION", "amount", deductions.attendance()));
        components.add(Map.of("name", "无薪及部分带薪假扣款", "type", "DEDUCTION", "amount", deductions.leave()));
        BigDecimal gross = amount(slip.getGrossTotal().add(variable));
        BigDecimal cashDeduction = amount(slip.getBenefitAmount()).add(deductions.attendance()).add(deductions.leave());
        applyTax(slip, period, slab, details, gross, cashDeduction, deductUnverified, false, components);
        advancePayroll.preview(slip);
    }

    public HrSalarySlip correction(Long employeeId, HrPayrollPeriod period, BigDecimal grossAdjustment, BigDecimal deductionAdjustment) {
        HrTaxSlab slab = taxSlab(employeeId, period.getEndDate());
        HrSalarySlip slip = new HrSalarySlip();
        slip.setTenantId(tenantId()); slip.setEmployeeId(employeeId); slip.setPeriodMonth(YearMonth.from(period.getEndDate()).toString());
        slip.setBenefitAmount(amount(BigDecimal.ZERO)); slip.setEmployeeConfirmed(false); slip.setDeleted(0); slip.setVersion(0);
        slip.setStatus("PENDING"); slip.setPayDate(period.getPayDate() == null ? period.getEndDate() : period.getPayDate());
        slip.setCreateBy(userName()); slip.setUpdateBy(userName()); slip.setCreateTime(LocalDateTime.now()); slip.setUpdateTime(LocalDateTime.now());
        List<Map<String, Object>> components = new ArrayList<>();
        components.add(Map.of("name", "应发补正差额", "type", "EARNING", "amount", amount(grossAdjustment)));
        components.add(Map.of("name", "税前扣除补正差额", "type", "DEDUCTION", "amount", amount(deductionAdjustment)));
        applyTax(slip, period, slab, configuration.details(slab.getSlabId()), amount(grossAdjustment), amount(deductionAdjustment), false, true, components);
        return slip;
    }

    private void applyTax(HrSalarySlip slip, HrPayrollPeriod period, HrTaxSlab slab, List<HrTaxSlabDetail> details,
            BigDecimal gross, BigDecimal cashDeduction, boolean deductUnverified, boolean correctionMode, List<Map<String, Object>> components) {
        HrEmployee employee = support.employee(slip.getEmployeeId());
        BigDecimal previousRaw = BigDecimal.ZERO;
        BigDecimal previousDeduction = BigDecimal.ZERO;
        BigDecimal previousPaid = BigDecimal.ZERO;
        BigDecimal previousAllowance = BigDecimal.ZERO;
        Map<Long, BigDecimal> declaredThisMonth = new HashMap<>();
        YearMonth month = YearMonth.from(period.getEndDate());
        YearMonth firstMonth = YearMonth.of(month.getYear(), 1);
        if (employee.getHireDate() != null && YearMonth.from(employee.getHireDate()).isAfter(firstMonth)) firstMonth = YearMonth.from(employee.getHireDate());
        Set<Long> correctionIds = correctionSlipIds();
        for (HrSalarySlip prior : employeeSlips(employee.getId())) {
            DateRange priorRange = range(prior);
            if (Objects.equals(prior.getId(), slip.getId()) || priorRange.end().isAfter(period.getEndDate())
                    || !priorRange.end().isBefore(period.getStartDate()) && !correctionMode && !correctionIds.contains(prior.getId())
                    || YearMonth.parse(prior.getPeriodMonth()).isBefore(firstMonth)
                    || correctionIds.contains(prior.getId()) && "PENDING".equals(prior.getStatus())) continue;
            if (!List.of("SUBMITTED", "PAID", "CONFIRMED").contains(prior.getStatus())) throw new HrBusinessException("PRIOR_PAYROLL_DRAFT", "之前周期工资单尚未确定，不能累计计税");
            Map<String, Object> snapshot = snapshot(prior);
            previousRaw = previousRaw.add(decimal(snapshot.get("currentTaxableIncome")));
            previousDeduction = previousDeduction.add(decimal(snapshot.get("currentDeduction")));
            previousPaid = previousPaid.add(amount(prior.getCurrentTax()));
            previousAllowance = previousAllowance.add(decimal(snapshot.get("thresholdApplied")));
            if (prior.getPeriodMonth().equals(month.toString()) && snapshot.get("specialDeductions") instanceof Map<?, ?> used) {
                used.forEach((key, value) -> declaredThisMonth.merge(Long.valueOf(String.valueOf(key)), decimal(value), BigDecimal::add));
            }
        }
        BigDecimal threshold = amount(slab.getThresholdAmount().multiply(BigDecimal.valueOf(ChronoUnit.MONTHS.between(firstMonth, month) + 1))
                .subtract(previousAllowance).max(BigDecimal.ZERO));
        Map<Long, BigDecimal> specialDetails = specialDeductions(employee.getId(), month, deductUnverified, declaredThisMonth);
        BigDecimal special = specialDetails.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal currentDeduction = cashDeduction.add(threshold).add(special);
        BigDecimal currentRaw = gross.subtract(currentDeduction);
        HrPayrollTaxCalculator.TaxResult tax = HrPayrollTaxCalculator.calculate(previousRaw, previousDeduction, previousPaid, currentRaw, currentDeduction, brackets(details));
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("name", "累计个税计算快照"); snapshot.put("type", "TAX_SNAPSHOT"); snapshot.put("amount", BigDecimal.ZERO);
        snapshot.put("slabId", slab.getSlabId()); snapshot.put("taxRate", tax.bracket().rate()); snapshot.put("quickDeduction", tax.bracket().quickDeduction());
        snapshot.put("brackets", details.stream().map(detail -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("from", detail.getFromAmount()); row.put("to", detail.getToAmount()); row.put("rate", detail.getTaxRate()); row.put("quickDeduction", detail.getQuickDeduction());
            return row;
        }).toList());
        snapshot.put("currentTaxableIncome", amount(currentRaw)); snapshot.put("currentDeduction", amount(currentDeduction));
        snapshot.put("cumulativeRawIncome", amount(previousRaw.add(currentRaw))); snapshot.put("thresholdApplied", threshold);
        snapshot.put("specialDeductions", specialDetails); snapshot.put("deductUnverified", deductUnverified);
        snapshot.put("periodStart", period.getStartDate().toString()); snapshot.put("periodEnd", period.getEndDate().toString());
        snapshot.put("correction", correctionMode);
        if (period.getPeriodId() != null) snapshot.put("payrollPeriodId", period.getPeriodId());
        components.add(snapshot);
        components.add(Map.of("name", "个人所得税", "type", "DEDUCTION", "amount", tax.currentTax()));
        slip.setGrossTotal(gross); slip.setTaxAmount(tax.currentTax()); slip.setCurrentTax(tax.currentTax());
        slip.setDeductionTotal(amount(cashDeduction.add(tax.currentTax()))); slip.setNetTotal(amount(gross.subtract(slip.getDeductionTotal())));
        slip.setCumulativeTaxableIncome(tax.cumulativeTaxableIncome()); slip.setCumulativeDeduction(tax.cumulativeDeduction());
        slip.setCumulativeTaxPayable(tax.cumulativeTaxPayable()); slip.setCumulativeTaxPaid(tax.cumulativeTaxPaid());
        slip.setComponents(components);
    }

    public static Map<String, Object> snapshot(HrSalarySlip slip) {
        return slip.getComponents() == null ? missingSnapshot() : slip.getComponents().stream()
                .filter(row -> "TAX_SNAPSHOT".equals(row.get("type"))).findFirst().orElseGet(HrPayrollCalculationService::missingSnapshot);
    }

    private static Map<String, Object> missingSnapshot() { throw new HrBusinessException("TAX_SNAPSHOT_MISSING", "历史工资单缺少累计计税快照，须先由财务核对"); }
    public static BigDecimal decimal(Object value) { return value == null ? BigDecimal.ZERO : new BigDecimal(String.valueOf(value)); }
    private List<HrPayrollTaxCalculator.Bracket> brackets(List<HrTaxSlabDetail> details) { return details.stream().map(detail -> new HrPayrollTaxCalculator.Bracket(detail.getFromAmount(), detail.getToAmount(), detail.getTaxRate(), detail.getQuickDeduction())).toList(); }
    private Set<Long> correctionSlipIds() { return correctionMapper.selectList(new LambdaQueryWrapper<HrPayrollCorrection>().eq(HrPayrollCorrection::getTenantId, tenantId()).isNotNull(HrPayrollCorrection::getCorrectionSlipId)).stream().map(HrPayrollCorrection::getCorrectionSlipId).collect(Collectors.toSet()); }
    public boolean hasCoverage(Long employeeId, LocalDate start, LocalDate end) {
        return employeeSlips(employeeId).stream().anyMatch(slip -> {
            DateRange covered = range(slip);
            return !covered.start().isAfter(end) && !covered.end().isBefore(start);
        });
    }

    private DateRange range(HrSalarySlip slip) {
        if (slip.getBatchId() != null) {
            HrPayrollBatch batch = batchMapper.selectById(slip.getBatchId());
            if (batch == null || !Objects.equals(batch.getTenantId(), tenantId())) throw new HrBusinessException("PAYROLL_BATCH_MISSING", "工资单关联批次无效");
            HrPayrollPeriod period = configuration.period(batch.getPayrollPeriodId());
            return new DateRange(period.getStartDate(), period.getEndDate());
        }
        if (slip.getComponents() != null) {
            Map<String, Object> snapshot = slip.getComponents().stream().filter(row -> "TAX_SNAPSHOT".equals(row.get("type"))).findFirst().orElse(Map.of());
            if (snapshot.get("periodStart") != null && snapshot.get("periodEnd") != null) return new DateRange(
                    LocalDate.parse(String.valueOf(snapshot.get("periodStart"))), LocalDate.parse(String.valueOf(snapshot.get("periodEnd"))));
        }
        YearMonth month = YearMonth.parse(slip.getPeriodMonth());
        return new DateRange(month.atDay(1), month.atEndOfMonth());
    }

    private Map<LocalDate, HrAttendanceRecord> attendance(Long employeeId, HrPayrollPeriod period) {
        Map<LocalDate, HrAttendanceRecord> records = new HashMap<>();
        attendanceMapper.selectList(new LambdaQueryWrapper<HrAttendanceRecord>().eq(HrAttendanceRecord::getTenantId, tenantId())
                .eq(HrAttendanceRecord::getEmployeeId, employeeId).eq(HrAttendanceRecord::getDeleted, 0)
                .between(HrAttendanceRecord::getAttendanceDate, period.getStartDate(), period.getEndDate()))
                .forEach(record -> records.put(record.getAttendanceDate(), record));
        return records;
    }

    public PayrollDeductions payrollDeductions(Long employeeId, HrPayrollPeriod period) {
        Map<LocalDate, HrAttendanceRecord> records = attendance(employeeId, period);
        List<HrTimeRequest> leaves = requestMapper.selectList(new LambdaQueryWrapper<HrTimeRequest>()
                .eq(HrTimeRequest::getTenantId, tenantId()).eq(HrTimeRequest::getEmployeeId, employeeId)
                .eq(HrTimeRequest::getDeleted, 0).eq(HrTimeRequest::getStatus, "APPROVED").eq(HrTimeRequest::getRequestType, "LEAVE")
                .lt(HrTimeRequest::getStartTime, period.getEndDate().plusDays(2).atStartOfDay()).gt(HrTimeRequest::getEndTime, period.getStartDate().atStartOfDay()));
        Map<Long, HrLeaveType> types = new HashMap<>();
        Map<Long, Map<String, Object>> leaveSnapshots = new HashMap<>();
        HrEmployee employee = support.employee(employeeId);
        HrEmployeeComp comp = compensation(employeeId, period.getEndDate());
        baseCompensation(comp, period);
        com.fasterxml.jackson.databind.JsonNode policy = basis(comp);
        String salaryBasis = policy.path("salaryBasis").asText("MONTHLY");
        String prorationBasis = policy.path("prorationBasis").asText("WORKDAYS");
        Map<YearMonth, Long> monthUnits = new HashMap<>();
        long periodUnits = "PER_PERIOD".equals(salaryBasis) ? payrollUnits(employeeId, period.getStartDate(), period.getEndDate(), prorationBasis) : 0;
        BigDecimal attendanceDeduction = BigDecimal.ZERO;
        BigDecimal leaveDeduction = BigDecimal.ZERO;
        for (LocalDate date = period.getStartDate(); !date.isAfter(period.getEndDate()); date = date.plusDays(1)) {
            if (employee.getHireDate() != null && date.isBefore(employee.getHireDate())) continue;
            BigDecimal absentDays = BigDecimal.ZERO;
            BigDecimal unpaidDays = BigDecimal.ZERO;
            Long calendar = calendarService.resolveCalendarId(employeeId, date);
            boolean workday = calendarService.isWorkday(calendar, date);
            HrAttendanceRecord record = records.get(date);
            if (workday && record != null && !"LEAVE".equals(record.getStatus()) && !"BUSINESS_TRIP".equals(record.getStatus())) {
                if (flag(record.getAbsentFlag()) || "ABSENT".equals(record.getStatus())) absentDays = absentDays.add(BigDecimal.ONE);
                else if (flag(record.getHalfDayFlag()) || "HALF_DAY".equals(record.getStatus())) absentDays = absentDays.add(new BigDecimal("0.5"));
                else {
                    int missed = Math.max(0, record.getLateMinutes() == null ? 0 : record.getLateMinutes())
                            + Math.max(0, record.getEarlyExitMinutes() == null ? 0 : record.getEarlyExitMinutes());
                    if (missed > 0) {
                        if (record.getExpectedMinutes() == null || record.getExpectedMinutes() <= 0) throw new HrBusinessException("EXPECTED_HOURS_MISSING", "日考勤缺少应出勤分钟数，无法核算扣款：" + date);
                        absentDays = absentDays.add(BigDecimal.valueOf(Math.min(missed, record.getExpectedMinutes()))
                                .divide(BigDecimal.valueOf(record.getExpectedMinutes()), 10, RoundingMode.HALF_UP));
                    }
                }
            }
            for (HrTimeRequest request : leaves) {
                if (!request.getStartTime().isBefore(date.plusDays(2).atStartOfDay()) || !request.getEndTime().isAfter(date.atStartOfDay())) continue;
                HrLeaveType type = types.computeIfAbsent(request.getLeaveTypeId(), leaveTypeMapper::selectById);
                if (type == null || !Objects.equals(type.getTenantId(), tenantId())) throw new HrBusinessException("LEAVE_TYPE_MISSING", "请假关联类型无效，无法核算薪资");
                Map<String, Object> snapshot = leaveSnapshots.computeIfAbsent(request.getId(), requestId -> support.auditDetail("TIME_REQUEST", requestId, "LEAVE_SUBMIT"));
                boolean unpaid = snapshot.containsKey("lwpFlag") ? Boolean.TRUE.equals(snapshot.get("lwpFlag")) || Boolean.FALSE.equals(snapshot.get("paidFlag"))
                        : flag(type.getLwpFlag()) || Integer.valueOf(0).equals(type.getIsPaid());
                boolean partial = snapshot.containsKey("partialPaidFlag") ? Boolean.TRUE.equals(snapshot.get("partialPaidFlag")) : flag(type.getPartialPaidFlag());
                BigDecimal paidFraction = unpaid ? BigDecimal.ZERO : partial ? (snapshot.containsKey("salaryFractionPerDay")
                        ? decimal(snapshot.get("salaryFractionPerDay")) : type.getSalaryFractionPerDay()) : BigDecimal.ONE;
                if (paidFraction == null || paidFraction.signum() < 0 || paidFraction.compareTo(BigDecimal.ONE) > 0) throw new HrBusinessException("INVALID_PAID_FRACTION", "部分带薪假比例须在0至1之间");
                boolean includeHoliday = snapshot.containsKey("includeHolidayFlag") ? Boolean.TRUE.equals(snapshot.get("includeHolidayFlag")) : flag(type.getIncludeHolidayFlag());
                BigDecimal days = dayCalculator.fraction(employeeId, request, date, includeHoliday);
                unpaidDays = unpaidDays.add(days.multiply(BigDecimal.ONE.subtract(paidFraction)));
            }
            unpaidDays = unpaidDays.min(BigDecimal.ONE);
            absentDays = absentDays.min(BigDecimal.ONE.subtract(unpaidDays));
            if (absentDays.signum() == 0 && unpaidDays.signum() == 0) continue;
            long units = "PER_PERIOD".equals(salaryBasis) ? periodUnits : monthUnits.computeIfAbsent(YearMonth.from(date),
                    month -> payrollUnits(employeeId, month.atDay(1), month.atEndOfMonth(), prorationBasis));
            if (units <= 0) throw new HrBusinessException("PAYROLL_WORKDAYS_MISSING", "计薪区间没有有效计薪日，无法换算扣款");
            BigDecimal dailySalary = comp.getTotalSalary().divide(BigDecimal.valueOf(units), 10, RoundingMode.HALF_UP);
            attendanceDeduction = attendanceDeduction.add(dailySalary.multiply(absentDays));
            leaveDeduction = leaveDeduction.add(dailySalary.multiply(unpaidDays));
        }
        return new PayrollDeductions(amount(attendanceDeduction), amount(leaveDeduction));
    }

    private Map<Long, BigDecimal> specialDeductions(Long employeeId, YearMonth month, boolean deductUnverified, Map<Long, BigDecimal> alreadyUsed) {
        List<HrTaxDeduction> rows = deductionMapper.selectList(new LambdaQueryWrapper<HrTaxDeduction>()
                .eq(HrTaxDeduction::getTenantId, tenantId()).eq(HrTaxDeduction::getEmployeeId, employeeId)
                .eq(HrTaxDeduction::getDeleted, 0).eq(HrTaxDeduction::getStatus, "ACTIVE")
                .le(HrTaxDeduction::getStartDate, month.atEndOfMonth())
                .and(query -> query.isNull(HrTaxDeduction::getEndDate).or().ge(HrTaxDeduction::getEndDate, month.atDay(1)))
                .in(HrTaxDeduction::getDeclareStatus, deductUnverified ? List.of("DECLARED", "PROOF_SUBMITTED", "VERIFIED") : List.of("VERIFIED")));
        Map<Long, BigDecimal> result = new LinkedHashMap<>();
        for (HrTaxDeduction row : rows) {
            if (row.getAmount() == null || row.getAmount().signum() < 0) throw new HrBusinessException("INVALID_TAX_DEDUCTION", "专项扣除金额无效");
            result.put(row.getId(), amount(row.getAmount().subtract(alreadyUsed.getOrDefault(row.getId(), BigDecimal.ZERO)).max(BigDecimal.ZERO)));
        }
        return result;
    }

    private record DateRange(LocalDate start, LocalDate end) {}
    public record PayrollDeductions(BigDecimal attendance, BigDecimal leave) {}
}
