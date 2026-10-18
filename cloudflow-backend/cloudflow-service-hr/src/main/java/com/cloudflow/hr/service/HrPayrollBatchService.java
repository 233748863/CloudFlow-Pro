package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.hr.domain.dto.HrPayrollBatchCreateRequest;
import com.cloudflow.hr.domain.entity.*;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;

import static com.cloudflow.hr.service.HrRuleSupport.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class HrPayrollBatchService {
    private final HrPayrollBatchMapper batchMapper;
    private final HrPayrollBatchEmployeeMapper employeeMapper;
    private final HrSalarySlipMapper slipMapper;
    private final HrPayrollPeriodMapper periodMapper;
    private final HrPayrollConfigurationService configuration;
    private final HrPayrollCalculationService calculation;
    private final HrRuleSupport support;
    private final HrRuleAsyncExecutor executor;
    private final IHrEssService essService;
    private final HrAdvancePayrollService advancePayroll;

    public List<HrPayrollBatchEmployee> preview(HrPayrollBatchCreateRequest request) {
        if (request == null) throw new HrBusinessException("INVALID_PAYROLL_BATCH", "批次参数不能为空");
        HrPayrollPeriod period = configuration.period(request.getPayrollPeriodId());
        configuration.assertOpen(period);
        List<HrPayrollBatchEmployee> rows = new ArrayList<>();
        for (HrEmployee employee : support.selectEmployees(request)) rows.add(buildEmployee(employee, period, flag(request.getValidateAttendanceFlag())));
        support.audit("PAYROLL_BATCH", null, "PREVIEW", Map.of("periodId", period.getPeriodId(), "employeeCount", rows.size()));
        return rows;
    }

    public Long create(HrPayrollBatchCreateRequest request) {
        if (request == null || request.getPayrollPeriodId() == null) throw new HrBusinessException("INVALID_PAYROLL_BATCH", "请选择薪资周期");
        return support.locked("payroll-period:" + request.getPayrollPeriodId(), () -> {
            HrPayrollPeriod period = configuration.period(request.getPayrollPeriodId());
            configuration.assertOpen(period);
            List<HrPayrollBatchEmployee> employees = preview(request);
            if (employees.isEmpty()) throw new HrBusinessException("PAYROLL_EMPTY", "当前权限及筛选条件未选中员工");
            HrPayrollBatch batch = new HrPayrollBatch();
            batch.setTenantId(tenantId()); batch.setBatchNo("PAY" + UUID.randomUUID().toString().replace("-", ""));
            batch.setPayrollPeriodId(period.getPeriodId()); batch.setPostingDate(request.getPostingDate() == null ? LocalDate.now() : request.getPostingDate());
            batch.setFilterDeptIds(request.getDeptIds()); batch.setFilterPositionIds(request.getPositionIds()); batch.setFilterJobLevelIds(request.getJobLevelIds());
            batch.setFilterEmployeeType(request.getEmployeeType()); batch.setFilterEmployeeIds(request.getEmployeeIds());
            batch.setValidateAttendanceFlag(flag(request.getValidateAttendanceFlag()) ? 1 : 0); batch.setDeductUnverifiedFlag(flag(request.getDeductUnverifiedFlag()) ? 1 : 0);
            batch.setEmployeeCount(employees.size()); batch.setStatus("DRAFT"); batch.setSlipCreatedFlag(0); batch.setSlipSubmittedFlag(0);
            batch.setTotalGross(BigDecimal.ZERO); batch.setTotalDeduction(BigDecimal.ZERO); batch.setTotalTax(BigDecimal.ZERO); batch.setTotalNet(BigDecimal.ZERO);
            batch.setDeleted(0); batch.setVersion(0); batch.setCreateBy(userName()); batch.setUpdateBy(userName());
            batch.setCreateTime(LocalDateTime.now()); batch.setUpdateTime(LocalDateTime.now());
            batchMapper.insert(batch);
            for (HrPayrollBatchEmployee employee : employees) { employee.setBatchId(batch.getBatchId()); employeeMapper.insert(employee); }
            support.audit("PAYROLL_BATCH", batch.getBatchId(), "CREATE", request);
            return batch.getBatchId();
        });
    }

    public void replaceEmployees(Long id, HrPayrollBatchCreateRequest request) {
        withBatch(id, batch -> {
            requireState(batch, "DRAFT");
            request.setPayrollPeriodId(batch.getPayrollPeriodId());
            request.setValidateAttendanceFlag(batch.getValidateAttendanceFlag());
            List<HrPayrollBatchEmployee> employees = preview(request);
            if (employees.isEmpty()) throw new HrBusinessException("PAYROLL_EMPTY", "批次员工清单不能为空");
            employeeMapper.delete(new LambdaQueryWrapper<HrPayrollBatchEmployee>().eq(HrPayrollBatchEmployee::getTenantId, tenantId()).eq(HrPayrollBatchEmployee::getBatchId, id));
            for (HrPayrollBatchEmployee employee : employees) { employee.setBatchId(id); employeeMapper.insert(employee); }
            // Keep the saved criteria consistent with the replaced employee rows.
            // Empty values must be written explicitly because updateById skips nulls.
            batch.setFilterDeptIds(request.getDeptIds() == null ? List.of() : request.getDeptIds());
            batch.setFilterPositionIds(request.getPositionIds() == null ? List.of() : request.getPositionIds());
            batch.setFilterJobLevelIds(request.getJobLevelIds() == null ? List.of() : request.getJobLevelIds());
            batch.setFilterEmployeeType(request.getEmployeeType() == null ? "" : request.getEmployeeType());
            batch.setFilterEmployeeIds(request.getEmployeeIds() == null ? List.of() : request.getEmployeeIds());
            batch.setEmployeeCount(employees.size()); update(batch);
            support.audit("PAYROLL_BATCH", id, "REPLACE_EMPLOYEES", Map.of("employeeCount", employees.size()));
            return null;
        });
    }

    private record CalculationStart(String previousStatus, Integer version) {}

    public String start(Long id, boolean retry) {
        CalculationStart started = withBatch(id, batch -> {
            if (retry) requireState(batch, "CALCULATED", "FAILED"); else requireState(batch, "DRAFT");
            if (retry && employees(id).stream().noneMatch(row -> "FAILED".equals(row.getCalcStatus()))) throw new HrBusinessException("NO_FAILED_EMPLOYEES", "没有可重跑的失败员工");
            String old = batch.getStatus();
            batch.setStatus("CALCULATING"); batch.setCalcStartTime(LocalDateTime.now()); batch.setErrorMessage("");
            update(batch);
            HrPayrollPeriod period = configuration.period(batch.getPayrollPeriodId());
            period.setStatus("CALCULATING"); periodMapper.updateById(period);
            support.audit("PAYROLL_BATCH", id, retry ? "RETRY_FAILED" : "CALCULATE", Map.of());
            return new CalculationStart(old, batch.getVersion());
        });
        try {
            return executor.submit("hrPayrollBatchCalculate", Map.of("batchId", id, "retry", retry, "batchVersion", started.version()));
        } catch (RuntimeException failure) {
            withBatch(id, batch -> {
                if ("CALCULATING".equals(batch.getStatus()) && Objects.equals(batch.getVersion(), started.version())) {
                    batch.setStatus(started.previousStatus()); update(batch); refreshPeriod(batch.getPayrollPeriodId());
                }
                return null;
            });
            throw failure;
        }
    }

    private int execute(Long id, boolean retry) {
        HrPayrollBatch batch = get(id);
        requireState(batch, "CALCULATING");
        HrPayrollPeriod period = configuration.period(batch.getPayrollPeriodId());
        int processed = 0;
        for (HrPayrollBatchEmployee employee : employees(id)) {
            if (retry ? !"FAILED".equals(employee.getCalcStatus()) : !List.of("PENDING", "SKIPPED").contains(employee.getCalcStatus())) continue;
            try {
                calculation.withGenerationLocks(employee.getEmployeeId(), period, () -> {
                    String error = calculation.preCheck(employee.getEmployeeId(), period, flag(batch.getValidateAttendanceFlag()));
                    if (error != null) {
                        employee.setCalcStatus("SKIPPED"); employee.setErrorMessage(error);
                    } else {
                        Long slipId = essService.generateSalarySlipForBatch(employee.getEmployeeId(), period, id, flag(batch.getDeductUnverifiedFlag()));
                        HrSalarySlip slip = slipMapper.selectById(slipId);
                        employee.setSalarySlipId(slipId); employee.setCalcStatus("SUCCESS"); employee.setErrorMessage("");
                        employee.setGrossTotal(slip.getGrossTotal()); employee.setNetTotal(slip.getNetTotal());
                    }
                    employee.setUpdateBy(userName()); employee.setUpdateTime(LocalDateTime.now());
                    employeeMapper.updateById(employee);
                    return null;
                });
                if ("SUCCESS".equals(employee.getCalcStatus())) processed++;
            } catch (RuntimeException failure) {
                log.error("薪资员工计算失败 batchId={}, employeeId={}, code={}", id, employee.getEmployeeId(),
                        failure instanceof HrBusinessException business ? business.getCode() : "PAYROLL_CALCULATION_FAILED");
                support.transaction(() -> {
                    HrPayrollBatchEmployee current = employeeMapper.selectById(employee.getBatchEmployeeId());
                    current.setCalcStatus("FAILED");
                    String message = failure instanceof HrBusinessException business ? business.getCode() : "计算失败，请按批次编号核查";
                    current.setErrorMessage(message.length() > 900 ? message.substring(0, 900) : message);
                    current.setUpdateBy(userName()); current.setUpdateTime(LocalDateTime.now()); employeeMapper.updateById(current);
                    return null;
                });
            }
        }
        withBatch(id, current -> {
            aggregate(current);
            current.setStatus("CALCULATED"); current.setCalcEndTime(LocalDateTime.now()); update(current);
            refreshPeriod(current.getPayrollPeriodId());
            support.audit("PAYROLL_BATCH", id, "CALCULATED", Map.of("employeeCount", current.getEmployeeCount(), "status", current.getStatus()));
            return null;
        });
        return processed;
    }

    public int executeSafely(Long id, boolean retry, int executionVersion) {
        if (executionVersion < 0) throw new HrBusinessException("INVALID_JOB_PARAMETER", "薪资任务执行轮次无效");
        return support.lockedWithoutTransaction("payroll-execution:" + id, () -> {
            HrPayrollBatch initial = get(id);
            if (List.of("CALCULATED", "SUBMITTED", "PAID", "CANCELLED", "FAILED").contains(initial.getStatus())) return 0;
            requireState(initial, "CALCULATING");
            if (!Objects.equals(initial.getVersion(), executionVersion)) return 0;
            try { return execute(id, retry); }
            catch (RuntimeException failure) {
                withBatch(id, batch -> {
                    if (!"CALCULATING".equals(batch.getStatus()) || !Objects.equals(batch.getVersion(), executionVersion)) return null;
                    for (HrPayrollBatchEmployee employee : employees(id)) {
                        if (!"PENDING".equals(employee.getCalcStatus())) continue;
                        employee.setCalcStatus("FAILED"); employee.setErrorMessage("批次中断，此员工尚未完成计算，可重跑"); employeeMapper.updateById(employee);
                    }
                    aggregate(batch); batch.setStatus("FAILED"); batch.setCalcEndTime(LocalDateTime.now()); update(batch); refreshPeriod(batch.getPayrollPeriodId());
                    support.audit("PAYROLL_BATCH", id, "CALCULATION_FAILED", Map.of());
                    return null;
                });
                throw failure;
            }
        });
    }

    public void submit(Long id) {
        withBatch(id, batch -> {
            requireState(batch, "CALCULATED");
            List<HrPayrollBatchEmployee> employees = employees(id);
            if (employees.stream().anyMatch(row -> List.of("PENDING", "FAILED").contains(row.getCalcStatus()))
                    || employees.stream().noneMatch(row -> "SUCCESS".equals(row.getCalcStatus()))) throw new HrBusinessException("PAYROLL_ERRORS_REMAIN", "仍有失败项或没有成功工资单，不能提交");
            for (HrSalarySlip slip : slips(id)) {
                support.assertEmployeeScope(slip.getEmployeeId());
                if (!"DRAFT".equals(slip.getStatus()) || Boolean.TRUE.equals(slip.getEmployeeConfirmed())) throw new HrBusinessException("SALARY_SLIP_FINAL", "工资单已确定");
                advancePayroll.assertReserved(slip);
                slip.setStatus("SUBMITTED"); essService.sealSalarySlip(slip); slipMapper.updateById(slip);
            }
            batch.setStatus("SUBMITTED"); batch.setSlipSubmittedFlag(1); update(batch);
            support.audit("PAYROLL_BATCH", id, "SUBMIT", Map.of());
            return null;
        });
    }

    public void pay(Long id) {
        withBatch(id, batch -> {
            requireState(batch, "SUBMITTED");
            for (HrSalarySlip slip : slips(id)) {
                advancePayroll.pay(slip.getId(), essService::verifySalarySlip);
            }
            batch.setStatus("PAID"); update(batch);
            support.audit("PAYROLL_BATCH", id, "PAY", Map.of());
            return null;
        });
    }

    @Audit(name = "取消薪资批次", spel = "#id", highRisk = true)
    public void cancel(Long id) {
        withBatch(id, batch -> {
            requireState(batch, "DRAFT", "CALCULATED", "FAILED");
            if (slips(id).stream().anyMatch(slip -> !"DRAFT".equals(slip.getStatus()) || Boolean.TRUE.equals(slip.getEmployeeConfirmed()))) throw new HrBusinessException("SALARY_SLIP_FINAL", "批次包含已确定工资单，不能取消");
            support.audit("PAYROLL_BATCH", id, "CANCEL", Map.of("employeeCount", batch.getEmployeeCount(), "status", batch.getStatus()));
            for (HrSalarySlip slip : slips(id)) advancePayroll.releaseSalary(slip.getId());
            slipMapper.delete(new LambdaQueryWrapper<HrSalarySlip>().eq(HrSalarySlip::getTenantId, tenantId()).eq(HrSalarySlip::getBatchId, id));
            employeeMapper.delete(new LambdaQueryWrapper<HrPayrollBatchEmployee>().eq(HrPayrollBatchEmployee::getTenantId, tenantId()).eq(HrPayrollBatchEmployee::getBatchId, id));
            batch.setStatus("CANCELLED"); update(batch); refreshPeriod(batch.getPayrollPeriodId());
            return null;
        });
    }

    public List<HrPayrollBatch> list() {
        List<HrPayrollBatch> rows = batchMapper.selectList(new LambdaQueryWrapper<HrPayrollBatch>().eq(HrPayrollBatch::getTenantId, tenantId())
                .eq(HrPayrollBatch::getDeleted, 0).orderByDesc(HrPayrollBatch::getCreateTime));
        List<HrPayrollBatch> allowed = rows.stream().filter(batch -> {
            try { assertScope(batch.getBatchId()); return true; }
            catch (HrBusinessException forbidden) { return false; }
        }).toList();
        support.audit("PAYROLL_BATCH", null, "READ_LIST", Map.of("count", allowed.size()));
        return allowed;
    }

    public Map<String, Object> detail(Long id) {
        HrPayrollBatch batch = get(id);
        List<HrPayrollBatchEmployee> employees = employees(id);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("batch", batch); result.put("employees", employees);
        result.put("processed", employees.stream().filter(row -> !"PENDING".equals(row.getCalcStatus())).count());
        support.audit("PAYROLL_BATCH", id, "READ_DETAIL", Map.of());
        return result;
    }

    public List<Map<String, String>> paidSalaryOptions(Long employeeId, Long periodId) {
        support.assertEmployeeScope(employeeId);
        HrPayrollPeriod period = configuration.period(periodId);
        List<HrSalarySlip> paid = slipMapper.selectList(new LambdaQueryWrapper<HrSalarySlip>()
                .select(HrSalarySlip::getId, HrSalarySlip::getBatchId, HrSalarySlip::getPeriodMonth, HrSalarySlip::getComponents)
                .eq(HrSalarySlip::getTenantId, tenantId()).eq(HrSalarySlip::getEmployeeId, employeeId)
                .eq(HrSalarySlip::getDeleted, 0).eq(HrSalarySlip::getStatus, "PAID")
                .eq(HrSalarySlip::getPeriodMonth, YearMonth.from(period.getEndDate()).toString()).orderByDesc(HrSalarySlip::getId));
        List<Long> batchIds = paid.stream().map(HrSalarySlip::getBatchId).filter(Objects::nonNull).distinct().toList();
        Map<Long, HrPayrollBatch> paidBatches = new HashMap<>();
        if (!batchIds.isEmpty()) {
            for (HrPayrollBatch batch : batchMapper.selectList(new LambdaQueryWrapper<HrPayrollBatch>()
                    .eq(HrPayrollBatch::getTenantId, tenantId()).in(HrPayrollBatch::getBatchId, batchIds))) {
                paidBatches.put(batch.getBatchId(), batch);
            }
        }
        List<Map<String, String>> options = new ArrayList<>();
        for (HrSalarySlip slip : paid) {
            Long originalPeriodId;
            if (slip.getBatchId() == null) {
                Map<String, Object> snapshot = slip.getComponents() == null ? Map.of() : slip.getComponents().stream()
                        .filter(component -> "TAX_SNAPSHOT".equals(component.get("type"))).findFirst().orElse(Map.of());
                Object savedPeriod = snapshot.get("payrollPeriodId");
                if (savedPeriod == null) continue;
                try { originalPeriodId = Long.valueOf(savedPeriod.toString()); }
                catch (NumberFormatException invalid) { continue; }
            } else {
                HrPayrollBatch batch = paidBatches.get(slip.getBatchId());
                originalPeriodId = batch == null ? null : batch.getPayrollPeriodId();
            }
            if (Objects.equals(period.getPeriodId(), originalPeriodId)) {
                options.add(Map.of("salarySlipId", slip.getId().toString(), "periodMonth", slip.getPeriodMonth()));
            }
        }
        support.audit("SALARY_SLIP", null, "READ_PAID_OPTIONS", Map.of("employeeId", employeeId, "periodId", periodId, "count", options.size()));
        return options;
    }

    public HrSalarySlip salarySlip(Long id) {
        HrSalarySlip slip = id == null ? null : slipMapper.selectById(id);
        if (slip == null || flag(slip.getDeleted()) || !Objects.equals(slip.getTenantId(), tenantId())) throw new HrBusinessException("SLIP_NOT_FOUND", "工资单不存在");
        support.assertEmployeeScope(slip.getEmployeeId());
        essService.verifySalarySlip(slip);
        support.audit("SALARY_SLIP", id, "READ_HR", Map.of());
        return slip;
    }

    public HrSalarySlip previewSalary(Long employeeId, Long periodId, boolean deductUnverified) {
        HrPayrollPeriod period = configuration.period(periodId);
        HrSalarySlip slip = essService.previewSalarySlip(employeeId, period, deductUnverified);
        support.audit("SALARY_SLIP", null, "PREVIEW", Map.of("employeeId", employeeId, "periodId", periodId));
        return slip;
    }

    private HrPayrollBatch get(Long id) {
        HrPayrollBatch batch = id == null ? null : batchMapper.selectById(id);
        if (batch == null || flag(batch.getDeleted()) || !Objects.equals(batch.getTenantId(), tenantId())) throw new HrBusinessException("BATCH_NOT_FOUND", "薪资批次不存在");
        assertScope(id);
        return batch;
    }

    private void assertScope(Long id) {
        List<HrPayrollBatchEmployee> employees = employees(id);
        if (employees.isEmpty()) {
            HrPayrollBatch batch = batchMapper.selectById(id);
            Integer scope = com.cloudflow.common.core.context.UserContext.getDsType();
            if (batch != null && scope != null && scope != 0 && !Objects.equals(batch.getCreateBy(), userName())) throw new HrBusinessException("FORBIDDEN", "无权查看该批次");
        }
        for (HrPayrollBatchEmployee employee : employees) support.assertEmployeeScope(employee.getEmployeeId());
    }
    private List<HrPayrollBatchEmployee> employees(Long id) { return employeeMapper.selectList(new LambdaQueryWrapper<HrPayrollBatchEmployee>().eq(HrPayrollBatchEmployee::getTenantId, tenantId()).eq(HrPayrollBatchEmployee::getBatchId, id).orderByAsc(HrPayrollBatchEmployee::getEmployeeId)); }
    private List<HrSalarySlip> slips(Long id) { return slipMapper.selectList(new LambdaQueryWrapper<HrSalarySlip>().eq(HrSalarySlip::getTenantId, tenantId()).eq(HrSalarySlip::getBatchId, id).eq(HrSalarySlip::getDeleted, 0)); }
    private void requireState(HrPayrollBatch batch, String... allowed) { if (!List.of(allowed).contains(batch.getStatus())) throw new HrBusinessException("INVALID_PAYROLL_STATE", "当前批次状态不允许此操作：" + batch.getStatus()); }
    private void update(HrPayrollBatch batch) { batch.setUpdateBy(userName()); batch.setUpdateTime(LocalDateTime.now()); batchMapper.updateById(batch); }
    private <T> T withBatch(Long id, Function<HrPayrollBatch, T> action) {
        HrPayrollBatch initial = get(id);
        return support.locked("payroll-period:" + initial.getPayrollPeriodId(), () -> support.locked("payroll-batch:" + id, () -> {
            HrPayrollBatch latest = get(id);
            configuration.assertOpen(configuration.period(latest.getPayrollPeriodId()));
            return advancePayroll.withEmployeeLocks(employees(id).stream().map(HrPayrollBatchEmployee::getEmployeeId).toList(), () -> action.apply(latest));
        }));
    }

    private HrPayrollBatchEmployee buildEmployee(HrEmployee employee, HrPayrollPeriod period, boolean validateAttendance) {
        HrPayrollBatchEmployee row = new HrPayrollBatchEmployee();
        row.setTenantId(tenantId()); row.setEmployeeId(employee.getId()); row.setEmployeeName(employee.getName());
        String error = calculation.preCheck(employee.getId(), period, validateAttendance);
        row.setCalcStatus(error == null ? "PENDING" : "SKIPPED"); row.setErrorMessage(error);
        row.setGrossTotal(BigDecimal.ZERO); row.setNetTotal(BigDecimal.ZERO);
        row.setCreateBy(userName()); row.setUpdateBy(userName()); row.setCreateTime(LocalDateTime.now()); row.setUpdateTime(LocalDateTime.now());
        return row;
    }

    private void aggregate(HrPayrollBatch batch) {
        BigDecimal gross = BigDecimal.ZERO, deduction = BigDecimal.ZERO, tax = BigDecimal.ZERO, net = BigDecimal.ZERO;
        for (HrSalarySlip slip : slips(batch.getBatchId())) { gross = gross.add(slip.getGrossTotal()); deduction = deduction.add(slip.getDeductionTotal()); tax = tax.add(slip.getTaxAmount()); net = net.add(slip.getNetTotal()); }
        batch.setTotalGross(amount(gross)); batch.setTotalDeduction(amount(deduction)); batch.setTotalTax(amount(tax)); batch.setTotalNet(amount(net));
        List<HrPayrollBatchEmployee> employees = employees(batch.getBatchId());
        long failed = employees.stream().filter(row -> "FAILED".equals(row.getCalcStatus())).count();
        long skipped = employees.stream().filter(row -> "SKIPPED".equals(row.getCalcStatus())).count();
        batch.setErrorMessage(failed == 0 && skipped == 0 ? "" : "失败" + failed + "人，跳过" + skipped + "人");
        batch.setSlipCreatedFlag(employees.stream().anyMatch(row -> "SUCCESS".equals(row.getCalcStatus())) ? 1 : 0);
    }

    private void refreshPeriod(Long id) {
        HrPayrollPeriod period = configuration.period(id);
        long calculating = batchMapper.selectCount(new LambdaQueryWrapper<HrPayrollBatch>().eq(HrPayrollBatch::getTenantId, tenantId())
                .eq(HrPayrollBatch::getPayrollPeriodId, id).eq(HrPayrollBatch::getStatus, "CALCULATING").eq(HrPayrollBatch::getDeleted, 0));
        period.setStatus(calculating > 0 ? "CALCULATING" : "OPEN"); periodMapper.updateById(period);
    }
}
