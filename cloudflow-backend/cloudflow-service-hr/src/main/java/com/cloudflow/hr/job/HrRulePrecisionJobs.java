package com.cloudflow.hr.job;

import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.job.annotation.JobHandler;
import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.hr.domain.dto.HrAttendanceRecalcRequest;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.service.HrAttendanceBusinessService;
import com.cloudflow.hr.service.HrLeaveBusinessService;
import com.cloudflow.hr.service.HrGrievanceService;
import com.cloudflow.hr.service.HrPayrollBatchService;
import com.cloudflow.hr.service.HrRuleSupport;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class HrRulePrecisionJobs {

    private final TenantIterator tenantIterator;
    private final HrLeaveBusinessService leaveService;
    private final HrAttendanceBusinessService attendanceService;
    private final HrPayrollBatchService payrollService;
    private final HrGrievanceService grievanceService;
    private final HrRuleSupport support;
    private final ObjectMapper objectMapper;

    @JobHandler(value = "hrEarnedLeaveAccrual", desc = "HR按月累积假期")
    @DistributedJob(name = "hr-earned-leave-accrual-job", lockTime = 1800, waitTime = 5)
    public int earnedLeaveAccrual() {
        return forEachTenant(() -> leaveService.accrueEarnedLeave(LocalDate.now()));
    }

    @JobHandler(value = "hrLeaveCarryForward", desc = "HR假期周期结转")
    @DistributedJob(name = "hr-leave-carry-forward-job", lockTime = 1800, waitTime = 5)
    public int leaveCarryForward() {
        return forEachTenant(() -> leaveService.carryForward(LocalDate.now()));
    }

    @JobHandler(value = "hrLeaveExpiry", desc = "HR结转额度过期作废")
    @DistributedJob(name = "hr-leave-expiry-job", lockTime = 1800, waitTime = 5)
    public int leaveExpiry() {
        return forEachTenant(() -> leaveService.expireCarryForward(LocalDate.now()));
    }

    @JobHandler(value = "hrLeaveQuotaReconcile", desc = "HR假期额度对账")
    @DistributedJob(name = "hr-leave-quota-reconcile-job", lockTime = 1800, waitTime = 5)
    public int leaveQuotaReconcile() {
        return forEachTenant(leaveService::reconcileQuotas);
    }

    @JobHandler(value = "hrAttendanceDailyCalc", desc = "HR每日自动考勤生成")
    @DistributedJob(name = "hr-attendance-daily-calc-job", lockTime = 1800, waitTime = 5)
    public int attendanceDailyCalc() {
        LocalDate yesterday = LocalDate.now().minusDays(1);
        return forEachTenant(() -> attendanceService.recalculate(null, yesterday, yesterday, false));
    }

    @JobHandler(value = "hrAttendanceRecalcAsync", desc = "HR考勤范围重算")
    @DistributedJob(name = "hr-attendance-recalc-async-job", lockTime = 3600, waitTime = 5)
    public int attendanceRecalcAsync(String param) {
        try {
            if (param == null || param.isBlank()) throw new HrBusinessException("INVALID_JOB_PARAMETER", "考勤重算须提供员工范围、起止日期和确认标记");
            HrAttendanceRecalcRequest request = objectMapper.readValue(param, HrAttendanceRecalcRequest.class);
            if (request == null || !request.isConfirmed()) throw new HrBusinessException("CONFIRMATION_REQUIRED", "请确认考勤重算范围");
            return attendanceService.recalculate(request, support.selectEmployees(request));
        } catch (IOException exception) {
            throw new HrBusinessException("INVALID_JOB_PARAMETER", "考勤任务参数必须为结构化 JSON", exception);
        }
    }

    @JobHandler(value = "hrPayrollBatchCalculate", desc = "HR薪资批次异步计算")
    @DistributedJob(name = "hr-payroll-batch-calculate-job", lockTime = 3600, waitTime = 5)
    public int payrollBatchCalculate(String param) {
        try {
            JsonNode request = param == null ? null : objectMapper.readTree(param);
            if (request == null || !request.path("batchId").isIntegralNumber() || !request.path("batchId").canConvertToLong() || request.path("batchId").asLong() <= 0
                    || !request.path("retry").isBoolean() || !request.path("batchVersion").isIntegralNumber()
                    || !request.path("batchVersion").canConvertToInt() || request.path("batchVersion").asInt() < 0) {
                throw new HrBusinessException("INVALID_JOB_PARAMETER", "薪资任务须指定批次编号、失败重跑标记和执行轮次");
            }
            return payrollService.executeSafely(request.path("batchId").asLong(), request.path("retry").asBoolean(), request.path("batchVersion").asInt());
        } catch (IOException exception) {
            throw new HrBusinessException("INVALID_JOB_PARAMETER", "薪资任务参数必须为结构化 JSON", exception);
        }
    }

    @JobHandler(value = "hrGrievanceAcceptanceReminder", desc = "HR申诉工作日受理提醒")
    @DistributedJob(name = "hr-grievance-acceptance-reminder-job", lockTime = 1800, waitTime = 5)
    public int grievanceAcceptanceReminder() {
        return forEachTenant(() -> grievanceService.remindUnaccepted(LocalDate.now()));
    }

    private int forEachTenant(Work work) {
        int total = 0;
        List<Long> failures = new ArrayList<>();
        for (Long tenantId : tenantIterator.listActiveTenantIds()) {
            try {
                total += TenantBroker.applyAs(tenantId, ignored -> work.run());
            } catch (RuntimeException ex) {
                failures.add(tenantId);
                log.error("HR规则任务租户执行失败, tenantId={}", tenantId, ex);
            }
        }
        if (!failures.isEmpty()) throw new IllegalStateException("HR规则任务存在失败租户：" + failures + "；已完成记录数：" + total);
        return total;
    }

    @FunctionalInterface
    private interface Work {
        int run();
    }
}
