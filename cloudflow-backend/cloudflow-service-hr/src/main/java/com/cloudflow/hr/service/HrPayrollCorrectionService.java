package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.hr.domain.dto.HrPayrollCorrectionRequest;
import com.cloudflow.hr.domain.entity.HrPayrollCorrection;
import com.cloudflow.hr.domain.entity.HrPayrollPeriod;
import com.cloudflow.hr.domain.entity.HrSalarySlip;
import com.cloudflow.hr.domain.entity.HrOvertimeRequest;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.log.annotation.SysLog;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrPayrollCorrectionMapper;
import com.cloudflow.hr.mapper.HrSalarySlipMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import static com.cloudflow.hr.service.HrRuleSupport.*;

@Service
@RequiredArgsConstructor
public class HrPayrollCorrectionService {
    private final HrPayrollCorrectionMapper correctionMapper;
    private final HrSalarySlipMapper slipMapper;
    private final HrPayrollBatchService batches;
    private final HrPayrollConfigurationService configuration;
    private final HrPayrollCalculationService calculation;
    private final HrRuleWorkflowService workflow;
    private final HrRuleSupport support;
    private final IHrEssService essService;
    private final com.cloudflow.hr.mapper.HrHMapper hMapper;
    private final HrHSupport helper;
    private final HrHEventService hEvents;
    private final org.springframework.beans.factory.ObjectProvider<HrOvertimeSettlementService> overtimeSettlement;
    private final HrAdvancePayrollService advancePayroll;

    public Long create(HrPayrollCorrectionRequest request) {
        if (request == null || !StringUtils.hasText(request.getReason())
                || amount(request.getGrossAdjustment()).signum() == 0 && amount(request.getDeductionAdjustment()).signum() == 0
                && (request.getAdvanceRepaymentIds() == null || request.getAdvanceRepaymentIds().isEmpty())) {
            throw new HrBusinessException("INVALID_CORRECTION", "补正须填写原因，并提供应发或税前扣除差额或选择原借款扣还记录");
        }
        HrSalarySlip original = batches.salarySlip(request.getOriginalSlipId());
        if (!"PAID".equals(original.getStatus())) throw new HrBusinessException("CORRECTION_REQUIRES_PAID", "仅已发放工资单可发起补正");
        HrPayrollPeriod period = configuration.period(request.getPayrollPeriodId());
        return calculation.withGenerationLocks(original.getEmployeeId(), period, () -> {
            HrAdvancePayrollService.assertNotInSettlement(batches.salarySlip(original.getId()).getReservedSettlementId());
            configuration.assertOpen(configuration.period(period.getPeriodId()));
            if (YearMonth.from(period.getEndDate()).isBefore(YearMonth.parse(original.getPeriodMonth()))) throw new HrBusinessException("CORRECTION_PERIOD_INVALID", "补正周期不可早于原工资单");
            if (calculation.employeeSlips(original.getEmployeeId()).stream().anyMatch(slip -> slip.getPeriodMonth().compareTo(YearMonth.from(period.getEndDate()).toString()) > 0)) {
                throw new HrBusinessException("CORRECTION_PERIOD_INVALID", "后续月份已有工资单，请选择新的开放周期补正");
            }
            if (calculation.employeeSlips(original.getEmployeeId()).stream().anyMatch(slip -> "PENDING".equals(slip.getStatus())
                    && YearMonth.parse(slip.getPeriodMonth()).getYear() == period.getEndDate().getYear())) {
                throw new HrBusinessException("CORRECTION_PENDING", "该员工本年度已有待审批补正，请先完成审批");
            }
            HrSalarySlip delta = calculation.correction(original.getEmployeeId(), period, amount(request.getGrossAdjustment()), amount(request.getDeductionAdjustment()));
            advancePayroll.applyReversals(delta, original, request.getAdvanceRepaymentIds());
            Map<String, Object> snapshot = HrPayrollCalculationService.snapshot(delta);
            snapshot.put("originalSlipId", original.getId());
            boolean advanceCorrection = HrAdvancePayrollService.hasReversals(delta);
            Map<String, Object> approvalSnapshot = advanceCorrection
                    ? helper.advanceCorrectionApprovals(helper.employee(original.getEmployeeId()), helper.user()) : Map.of();
            if (advanceCorrection) snapshot.put("hAdvanceWorkflow", approvalSnapshot);
            slipMapper.insert(delta);
            HrPayrollCorrection correction = new HrPayrollCorrection();
            correction.setTenantId(tenantId()); correction.setOriginalSlipId(original.getId()); correction.setCorrectionSlipId(delta.getId());
            correction.setReason(request.getReason()); correction.setDiffAmount(delta.getNetTotal()); correction.setStatus("PENDING");
            correction.setCorrectedBy(UserContext.getUserId()); correction.setCorrectionTime(LocalDateTime.now());
            correction.setDeleted(0); correction.setVersion(0); correction.setCreateBy(userName()); correction.setUpdateBy(userName());
            correction.setCreateTime(LocalDateTime.now()); correction.setUpdateTime(LocalDateTime.now()); correctionMapper.insert(correction);
            if (advanceCorrection) workflow.enqueueAdvanceCorrection(correction, original.getEmployeeId(), approvalSnapshot);
            else workflow.enqueue("HR_PAYROLL_CORRECTION", correction.getCorrectionId(), "COR" + correction.getCorrectionId(), "工资补正审批",
                    Map.of("employeeId", original.getEmployeeId(), "originalSlipId", original.getId(), "correctionId", correction.getCorrectionId()));
            support.audit("PAYROLL_CORRECTION", correction.getCorrectionId(), "SUBMIT", Map.of("originalSlipId", original.getId(),
                    "correctionSlipId", delta.getId(), "targetPeriodId", period.getPeriodId(), "status", correction.getStatus()));
            return correction.getCorrectionId();
        });
    }

    public void withCorrectionLock(Long id, Runnable action) {
        HrPayrollCorrection correction = get(id);
        HrSalarySlip slip = slipMapper.selectById(correction.getCorrectionSlipId());
        HrOvertimeRequest source = hMapper.correctionSource(tenantId(), id);
        if (source != null) {
            Long targetId = HrHSupport.number(HrPayrollCalculationService.snapshot(slip).get("payrollPeriodId"));
            helper.locked(overtimeSettlement.getObject().locks(source, List.of(targetId)), () -> {
                overtimeSettlement.getObject().lockPayrollPeriods(source, List.of(targetId));
                return advancePayroll.withEmployeeLocks(List.of(slip.getEmployeeId()), () -> { action.run(); return null; });
            }); return;
        }
        support.locked("payroll-year:" + slip.getEmployeeId() + ":" + YearMonth.parse(slip.getPeriodMonth()).getYear(),
                () -> advancePayroll.withEmployeeLocks(List.of(slip.getEmployeeId()), () -> { action.run(); return null; }));
    }

    public void onApproval(Long id, String status) {
        if (hMapper.correctionSource(tenantId(), id) != null) throw HrHException.conflict("H_CALLBACK_REQUIRED", "关联加班补正须经过真实办理人校验");
        HrPayrollCorrection correction = get(id);
        HrSalarySlip slip = slipMapper.selectById(correction.getCorrectionSlipId());
        if (HrAdvancePayrollService.hasReversals(slip)) throw HrHException.conflict("H_CALLBACK_REQUIRED", "借款扣还补正须经过冻结财务与真实实例核验");
        if ("APPROVED".equals(status)) {
            Long periodId = HrPayrollCalculationService.decimal(HrPayrollCalculationService.snapshot(slip).get("payrollPeriodId")).longValueExact();
            configuration.assertOpen(configuration.period(periodId));
            if ("PENDING".equals(slip.getStatus())) {
                slip.setStatus("SUBMITTED"); essService.sealSalarySlip(slip); slipMapper.updateById(slip);
            }
            correction.setStatus("APPLIED"); correction.setCorrectionTime(LocalDateTime.now()); correctionMapper.updateById(correction);
        } else if ("REJECTED".equals(status)) {
            slip.setStatus("CANCELLED"); essService.sealSalarySlip(slip); slipMapper.updateById(slip);
        }
        support.audit("PAYROLL_CORRECTION", id, status, Map.of("correctionId", id, "originalSlipId", correction.getOriginalSlipId(),
                "correctionSlipId", correction.getCorrectionSlipId(), "status", correction.getStatus()));
    }

    public void pay(Long id) {
        withCorrectionLock(id, () -> {
            HrPayrollCorrection correction = get(id);
            if (!"APPLIED".equals(correction.getStatus())) throw new HrBusinessException("CORRECTION_NOT_APPROVED", "工资补正尚未审批通过");
            HrSalarySlip slip = slipMapper.selectById(correction.getCorrectionSlipId());
            advancePayroll.pay(slip.getId(), essService::verifySalarySlip);
            support.audit("PAYROLL_CORRECTION", id, "PAY", Map.of("correctionId", id, "slipId", slip.getId(), "status", "PAID"));
        });
    }

    @SysLog(value = "处理借款扣还补正终审", logParams = false)
    public boolean handleAdvanceApproval(ApprovalResultDTO result) {
        HrPayrollCorrection initial = get(result.getBusinessId());
        if (!HrAdvancePayrollService.hasReversals(slipMapper.selectById(initial.getCorrectionSlipId()))) return false;
        withCorrectionLock(initial.getCorrectionId(), () -> {
            HrPayrollCorrection correction = get(initial.getCorrectionId());
            HrSalarySlip delta = slipMapper.selectById(correction.getCorrectionSlipId());
            if (!Objects.equals(result.getTenantId(), tenantId()) || !"HR_PAYROLL_CORRECTION".equals(result.getBusinessType())
                    || !Objects.equals(result.getBusinessNo(), "COR" + correction.getCorrectionId())) throw HrHException.conflict("CALLBACK_IDENTITY_CONFLICT", "借款工资补正回调身份不匹配");
            if (correction.getInstanceId() == null) throw HrHException.conflict("WORKFLOW_BINDING_PENDING", "等待借款工资补正审批实例绑定");
            if (!correction.getInstanceId().equals(result.getProcessInstanceId())) throw HrHException.conflict("WORKFLOW_BINDING_CONFLICT", "借款工资补正回调实例不匹配");
            ObjectNode snapshot = helper.tree(helper.json(HrPayrollCalculationService.snapshot(delta).get("hAdvanceWorkflow")));
            helper.correctionActor(snapshot, result.getApproverId());
            if (!List.of("APPROVED", "REJECTED").contains(result.getApprovalResult())) throw HrHException.invalid("补正审批结果无效");
            String expected = "APPROVED".equals(result.getApprovalResult()) ? "APPLIED" : "REJECTED";
            if (List.of("APPLIED", "REJECTED").contains(correction.getStatus())) {
                if (!expected.equals(correction.getStatus())) throw HrHException.conflict("CORRECTION_STATE_CONFLICT", "重复回调结果与原补正审批不一致");
                return;
            }
            if (!List.of("PENDING", "APPROVING").contains(correction.getStatus()) || !"PENDING".equals(delta.getStatus())) {
                throw HrHException.conflict("CORRECTION_STATE_CONFLICT", "借款工资补正与工资单状态不一致");
            }
            if (!hEvents.mark(result, "ADVANCE_CORRECTION_DECISION")) return;
            if ("APPROVED".equals(result.getApprovalResult())) {
                Long periodId = HrHSupport.number(HrPayrollCalculationService.snapshot(delta).get("payrollPeriodId"));
                configuration.assertOpen(configuration.period(periodId));
                delta.setStatus("SUBMITTED");
            } else delta.setStatus("CANCELLED");
            essService.sealSalarySlip(delta);
            correction.setStatus(expected); correction.setCorrectionTime(HrHSupport.now());
            if (slipMapper.updateById(delta) != 1 || correctionMapper.updateById(correction) != 1) throw HrHException.conflict("VERSION_CONFLICT", "保存借款补正审批时状态变化");
            support.audit("PAYROLL_CORRECTION", correction.getCorrectionId(), "ADVANCE_APPROVAL_RESULT",
                    Map.of("correctionSlipId", delta.getId(), "status", correction.getStatus(), "approverId", result.getApproverId()));
        });
        return true;
    }

    @SysLog(value = "创建加班关联工资补正", logParams = false)
    public HrPayrollCorrection createOvertimeCorrectionLocked(HrOvertimeRequest source, Long originalSlipId, Long targetPeriodId, String reason) {
        if (!org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()) throw HrHException.conflict("TRANSACTION_REQUIRED", "关联补正须在原处置事务中创建");
        helper.operator(source.getEmployeeId(), "hr:overtime:price"); helper.permission("hr:payroll:correct");
        if (!"APPROVED".equals(source.getStatus()) || !"NEEDS_RESOLUTION".equals(source.getSettlementStatus()) || source.getPayrollCorrectionId() != null) throw HrHException.conflict("CORRECTION_SOURCE_CONFLICT", "原申请不允许新建关联补正");
        overtimeSettlement.getObject().assertOriginalPaid(source, originalSlipId);
        HrSalarySlip original = slipMapper.selectById(originalSlipId); HrPayrollPeriod period = configuration.period(targetPeriodId); configuration.assertOpen(period);
        if (Objects.equals(source.getPayrollPeriodId(), targetPeriodId) || YearMonth.from(period.getEndDate()).isBefore(YearMonth.parse(original.getPeriodMonth()))) throw HrHException.conflict("CORRECTION_PERIOD_INVALID", "补正须明确选择不早于原工资月份的新开放周期");
        List<HrSalarySlip> prior = calculation.employeeSlips(source.getEmployeeId());
        if (prior.stream().anyMatch(slip -> slip.getPeriodMonth().compareTo(YearMonth.from(period.getEndDate()).toString()) > 0)) throw HrHException.conflict("CORRECTION_PERIOD_INVALID", "后续月份已有工资单，请选择新的开放周期");
        if (prior.stream().anyMatch(slip -> "PENDING".equals(slip.getStatus()) && YearMonth.parse(slip.getPeriodMonth()).getYear() == period.getEndDate().getYear())) throw HrHException.conflict("CORRECTION_PENDING", "该员工本年度已有待审批补正");
        BigDecimal gross = overtimeSettlement.getObject().amount(source); Map<String, Object> actors = helper.correctionApprovals(source);
        HrSalarySlip delta = calculation.correction(source.getEmployeeId(), period, gross, BigDecimal.ZERO);
        Map<String, Object> snapshot = HrPayrollCalculationService.snapshot(delta); snapshot.put("originalSlipId", originalSlipId);
        snapshot.put("overtimeRequestId", source.getRequestId().toString()); snapshot.put("originalPayrollPeriodId", source.getPayrollPeriodId().toString()); snapshot.put("hOvertimeWorkflow", actors);
        slipMapper.insert(delta);
        HrPayrollCorrection correction = new HrPayrollCorrection(); correction.setTenantId(tenantId()); correction.setOriginalSlipId(originalSlipId); correction.setCorrectionSlipId(delta.getId());
        correction.setReason(HrHSupport.text(reason, 500)); correction.setDiffAmount(delta.getNetTotal()); correction.setStatus("PENDING");
        correction.setCorrectedBy(helper.user()); correction.setCorrectionTime(HrHSupport.now()); correction.setDeleted(0); correction.setVersion(0);
        correction.setCreateBy(userName()); correction.setUpdateBy(userName()); correction.setCreateTime(HrHSupport.now()); correction.setUpdateTime(HrHSupport.now()); correctionMapper.insert(correction);
        workflow.enqueueOvertimeCorrection(correction, source, actors);
        support.audit("PAYROLL_CORRECTION", correction.getCorrectionId(), "H_SUBMIT", Map.of("overtimeRequestId", source.getRequestId(), "originalSlipId", originalSlipId,
                "correctionSlipId", delta.getId(), "targetPeriodId", targetPeriodId, "status", correction.getStatus())); return correction;
    }

    @SysLog(value = "处理加班关联补正终审", logParams = false)
    public boolean handleOvertimeApproval(ApprovalResultDTO result) {
        HrOvertimeRequest source = hMapper.correctionSource(tenantId(), result.getBusinessId());
        if (source == null) return false;
        HrPayrollCorrection initial = get(result.getBusinessId()); HrSalarySlip initialSlip = slipMapper.selectById(initial.getCorrectionSlipId());
        Long targetId = HrHSupport.number(HrPayrollCalculationService.snapshot(initialSlip).get("payrollPeriodId"));
        helper.locked(overtimeSettlement.getObject().locks(source, List.of(targetId)), () -> {
            overtimeSettlement.getObject().lockPayrollPeriods(source, List.of(targetId));
            HrOvertimeRequest lockedSource = hMapper.overtimeLocked(tenantId(), source.getRequestId()); HrPayrollCorrection correction = hMapper.correctionLocked(tenantId(), initial.getCorrectionId());
            HrSalarySlip delta = slipMapper.selectById(correction.getCorrectionSlipId());
            if (!Objects.equals(result.getTenantId(), tenantId()) || !"HR_PAYROLL_CORRECTION".equals(result.getBusinessType())
                    || !Objects.equals(result.getBusinessNo(), "COR" + correction.getCorrectionId())) throw HrHException.conflict("CALLBACK_IDENTITY_CONFLICT", "工资补正回调来源不一致");
            if (correction.getInstanceId() == null) throw HrHException.conflict("WORKFLOW_BINDING_PENDING", "等待工资补正实例绑定恢复");
            if (!correction.getInstanceId().equals(result.getProcessInstanceId())) throw HrHException.conflict("WORKFLOW_BINDING_CONFLICT", "工资补正回调实例不一致");
            ObjectNode snapshot = helper.tree(helper.json(HrPayrollCalculationService.snapshot(delta).get("hOvertimeWorkflow"))); helper.correctionActor(snapshot, result.getApproverId());
            if (!List.of("APPROVED", "REJECTED").contains(result.getApprovalResult())) throw HrHException.invalid("补正审批结果无效");
            if (List.of("APPLIED", "REJECTED", "APPROVED").contains(correction.getStatus())) return null;
            if (!List.of("PENDING", "APPROVING").contains(correction.getStatus()) || !"CORRECTION_PENDING".equals(lockedSource.getSettlementStatus())
                    || !Objects.equals(lockedSource.getPayrollCorrectionId(), correction.getCorrectionId()) || !"PENDING".equals(delta.getStatus())) throw HrHException.conflict("CORRECTION_STATE_CONFLICT", "关联补正与工资单执行状态不一致");
            overtimeSettlement.getObject().assertOriginalPaid(lockedSource, correction.getOriginalSlipId());
            if (!hEvents.mark(result, "H_CORRECTION_DECISION")) return null;
            HrPayrollPeriod target = hMapper.payrollPeriodLocked(tenantId(), targetId);
            boolean targetClosed = target == null || flag(target.getDeleted()) || !"OPEN".equals(target.getStatus());
            boolean approved = "APPROVED".equals(result.getApprovalResult());
            correction.setStatus(result.getApprovalResult());
            if (approved && !targetClosed) { delta.setStatus("SUBMITTED"); correction.setStatus("APPLIED"); }
            else delta.setStatus("CANCELLED");
            essService.sealSalarySlip(delta);
            if (slipMapper.updateById(delta) != 1) throw HrHException.conflict("VERSION_CONFLICT", "补正工资单版本变化");
            correction.setCorrectionTime(HrHSupport.now());
            if (correctionMapper.updateById(correction) != 1) throw HrHException.conflict("VERSION_CONFLICT", "补正执行状态变化");
            overtimeSettlement.getObject().correctionResult(correction.getCorrectionId(), result.getApprovalResult(), approved && !targetClosed, approved && targetClosed);
            support.audit("PAYROLL_CORRECTION", correction.getCorrectionId(), "H_APPROVAL_RESULT", Map.of("overtimeRequestId", source.getRequestId(), "correctionSlipId", delta.getId(), "status", correction.getStatus())); return null;
        });
        return true;
    }

    public void assertOvertimeApplied(HrOvertimeRequest source) {
        HrPayrollCorrection correction = correctionMapper.selectById(source.getPayrollCorrectionId());
        HrSalarySlip delta = correction == null ? null : slipMapper.selectById(correction.getCorrectionSlipId());
        if (correction == null || delta == null || !Objects.equals(correction.getTenantId(), tenantId()) || !Objects.equals(delta.getTenantId(), tenantId())
                || flag(correction.getDeleted()) || flag(delta.getDeleted()) || !"APPLIED".equals(correction.getStatus()) || !List.of("SUBMITTED", "PAID").contains(delta.getStatus())
                || !Objects.equals(delta.getEmployeeId(), source.getEmployeeId()) || !source.getRequestId().toString().equals(String.valueOf(HrPayrollCalculationService.snapshot(delta).get("overtimeRequestId")))
                || delta.getGrossTotal().compareTo(overtimeSettlement.getObject().amount(source)) != 0) throw HrHException.conflict("CORRECTION_NOT_APPLIED", "关联D补正未真实应用，不能认定加班已结算");
    }

    public List<HrPayrollCorrection> list() {
        List<HrPayrollCorrection> rows = correctionMapper.selectList(new LambdaQueryWrapper<HrPayrollCorrection>()
                .eq(HrPayrollCorrection::getTenantId, tenantId()).eq(HrPayrollCorrection::getDeleted, 0).orderByDesc(HrPayrollCorrection::getCreateTime));
        List<HrPayrollCorrection> allowed = rows.stream().filter(row -> {
            HrSalarySlip slip = slipMapper.selectById(row.getOriginalSlipId());
            if (slip == null) return false;
            try { support.assertEmployeeScope(slip.getEmployeeId()); return true; }
            catch (HrBusinessException forbidden) { return false; }
        }).toList();
        support.audit("PAYROLL_CORRECTION", null, "READ_LIST", Map.of("count", allowed.size()));
        return allowed;
    }

    private HrPayrollCorrection get(Long id) {
        HrPayrollCorrection row = id == null ? null : correctionMapper.selectById(id);
        if (row == null || flag(row.getDeleted()) || !Objects.equals(row.getTenantId(), tenantId())) throw new HrBusinessException("CORRECTION_NOT_FOUND", "工资补正不存在");
        HrSalarySlip original = slipMapper.selectById(row.getOriginalSlipId());
        if (original == null || !Objects.equals(original.getTenantId(), tenantId())) throw new HrBusinessException("SLIP_NOT_FOUND", "原工资单不存在");
        support.assertEmployeeScope(original.getEmployeeId());
        return row;
    }
}
