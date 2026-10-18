package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.hr.domain.dto.HrReferralRequests;
import com.cloudflow.hr.domain.entity.HrCompChange;
import com.cloudflow.hr.domain.entity.HrCompComponent;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrEmployeeReferral;
import com.cloudflow.hr.domain.entity.HrPayrollPeriod;
import com.cloudflow.hr.domain.entity.HrSalarySlip;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.hr.mapper.HrCompChangeMapper;
import com.cloudflow.hr.mapper.HrCompComponentMapper;
import com.cloudflow.hr.mapper.HrEmployeeReferralMapper;
import com.cloudflow.hr.mapper.HrPayrollPeriodMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

import static com.cloudflow.hr.service.HrHException.*;
import static com.cloudflow.hr.service.HrRuleSupport.tenantId;

@Service
@RequiredArgsConstructor
public class HrReferralBonusService {
    private static final String TYPE = "HR_REFERRAL";
    private final HrEmployeeReferralMapper referrals;
    private final HrCompChangeMapper changes;
    private final HrCompComponentMapper components;
    private final HrPayrollPeriodMapper periods;
    private final HrReferralProgressService progress;
    private final HrHSupport access;
    private final HrRuleSupport support;
    private final HrRuleWorkflowService workflow;
    private final HrHEventService events;

    @Audit(name = "核定并提交内推奖金审批", spel = "#referralId")
    public void qualify(Long referralId, HrReferralRequests.Bonus request) {
        access.permission("hr:referral:bonus"); access.validate(request);
        BigDecimal amount = new BigDecimal(request.getAmount()).setScale(2);
        if (amount.signum() <= 0) throw invalid("奖金须大于零");
        support.transaction(() -> {
            HrEmployeeReferral row = lockForBonus(referralId); access.scope(row.getReferrerEmployeeId());
            if (!"NOT_APPLICABLE".equals(row.getBonusStatus())) {
                if (matches(row, request, amount)) return null;
                throw conflict("BONUS_ALREADY_SUBMITTED", "奖金已核定，金额与发放依据不能重复改写");
            }
            if (row.getInstanceId() != null) throw conflict("BONUS_APPROVAL_FINISHED", "本次奖金审批已结束，请核对审批结果");
            HrHSupport.version(request.getVersion(), row.getVersion());
            Map<String, Object> employment = progress.requireEmployment(row);
            HrEmployee referrer = access.employee(row.getReferrerEmployeeId());
            component(request.getSalaryComponentId());
            HrPayrollPeriod period = period(request.getPayrollPeriodId());
            if (referrals.salaryCount(tenantId(), row.getReferrerEmployeeId(), period.getPeriodId()) > 0) throw conflict("BONUS_PAYROLL_EXISTS", "该周期已生成工资，请选择尚未算薪的工资周期");
            if (period.getEndDate().isBefore(row.getHireDate()) || period.getEndDate().isBefore(LocalDate.now())) throw invalid("请选择已满足奖金条件后的未结束工资周期");
            Map<String, Object> approvals = access.referralApprovals(referrer, access.user());
            ObjectNode snapshot = access.tree(access.json(Map.of("employment", employment, "workflow", approvals,
                    "salaryComponentId", request.getSalaryComponentId().toString(), "payrollPeriodId", period.getPeriodId().toString(),
                    "effectiveDate", period.getEndDate().toString(), "amount", amount.toPlainString(), "conditionRemark", request.getConditionRemark().strip(),
                    "verifiedBy", access.user().toString(), "verifiedDate", LocalDate.now().toString())));
            row.setBonusApplicableFlag(1); row.setBonusAmount(amount); row.setBonusStatus("PENDING");
            row.setBonusConditionRemark(request.getConditionRemark().strip()); row.setBonusConditionSnapshot(snapshot); save(row);
            Map<String, Object> variables = new LinkedHashMap<>(); variables.put("referralId", referralId.toString());
            variables.put("employeeId", referrer.getId().toString()); variables.put("detailPath", "/hr/referrals?referralId=" + referralId);
            for (String field : List.of("applicantUserId", "beneficiaryUserId", HrHSupport.EXCLUDED_USERS, "responsibleApproverIds", "hrApproverIds")) variables.put(field, approvals.get(field));
            workflow.enqueueForApplicant(TYPE, referralId, row.getReferralNo(), "内推奖金审批", access.user(), variables);
            support.audit(TYPE, referralId, "BONUS_SUBMITTED", Map.of("payrollPeriodId", period.getPeriodId(), "salaryComponentId", request.getSalaryComponentId()));
            return null;
        });
    }

    public void onApproval(ApprovalResultDTO result) {
        support.transaction(() -> {
            HrEmployeeReferral row = lockForBonus(result.getBusinessId());
            if (!TYPE.equals(result.getBusinessType()) || !Objects.equals(result.getTenantId(), tenantId())
                    || !Objects.equals(result.getBusinessNo(), row.getReferralNo())) throw conflict("CALLBACK_IDENTITY_CONFLICT", "奖金审批来源不一致");
            if (row.getInstanceId() == null) throw conflict("WORKFLOW_BINDING_PENDING", "等待奖金审批实例绑定恢复");
            if (!Objects.equals(row.getInstanceId(), result.getProcessInstanceId())) throw conflict("WORKFLOW_BINDING_CONFLICT", "奖金审批实例不一致");
            ObjectNode snapshot = snapshot(row);
            access.callbackActor(access.tree(access.json(snapshot.path("workflow"))), result.getApproverId(), result.getApprovalResult());
            if (!List.of("APPROVED", "REJECTED").contains(Objects.toString(result.getApprovalResult(), ""))) throw invalid("奖金审批结果无效");
            String decided = snapshot.path("decision").asText();
            if (!decided.isBlank()) {
                if (!decided.equals(result.getApprovalResult())) throw conflict("BONUS_DECISION_CONFLICT", "奖金审批结果与已保存结果冲突");
                return null;
            }
            if (!"PENDING".equals(row.getBonusStatus())) throw conflict("BONUS_STATE_CONFLICT", "奖金当前不处于审批状态");
            if (!events.mark(result, "REFERRAL_BONUS_DECISION")) throw conflict("BONUS_DECISION_MISSING", "奖金回调标记与业务结果不一致");
            if ("APPROVED".equals(result.getApprovalResult())) {
                progress.requireEmployment(row); component(HrHSupport.number(snapshot.path("salaryComponentId").asText()));
                HrPayrollPeriod period = period(HrHSupport.number(snapshot.path("payrollPeriodId").asText()));
                HrCompChange change = sourceChange(row.getReferralId());
                if (change != null) throw conflict("BONUS_SOURCE_CONFLICT", "已存在未经本次审批关联的奖金工资项");
                change = new HrCompChange(); change.setTenantId(tenantId()); change.setEmployeeId(row.getReferrerEmployeeId());
                change.setChangeNo("REFBONUS" + row.getReferralId()); change.setChangeType("REFERRAL_BONUS");
                change.setSourceBizType(TYPE); change.setSourceBizId(row.getReferralId().toString());
                change.setSalaryComponentId(HrHSupport.number(snapshot.path("salaryComponentId").asText())); change.setPayrollPeriodId(period.getPeriodId());
                change.setBeforeTotal(BigDecimal.ZERO); change.setAfterTotal(row.getBonusAmount());
                change.setChangeAmount(row.getBonusAmount()); change.setEffectiveDate(LocalDate.parse(snapshot.path("effectiveDate").asText()));
                change.setReason(row.getBonusConditionRemark()); change.setStatus("APPROVED"); change.setProcessInstanceId(row.getInstanceId());
                change.setDeleted(0); change.setVersion(0);
                if (changes.insert(change) != 1) throw conflict("BONUS_SAVE_FAILED", "奖金工资项保存失败");
                row.setCompChangeId(change.getId()); row.setBonusStatus("APPROVED");
            } else { row.setBonusApplicableFlag(0); row.setBonusStatus("NOT_APPLICABLE"); }
            snapshot.put("decision", result.getApprovalResult()); row.setBonusConditionSnapshot(snapshot); save(row);
            support.audit(TYPE, row.getReferralId(), "BONUS_DECISION", Map.of("result", result.getApprovalResult(), "instanceId", row.getInstanceId()));
            return null;
        });
    }

    public void validatePayroll(HrCompChange change, Long employeeId, Long periodId) {
        HrEmployeeReferral row = locked(HrHSupport.number(change.getSourceBizId()));
        validateChange(row, change, employeeId, periodId);
        if (!"APPROVED".equals(row.getBonusStatus())) throw conflict("BONUS_NOT_PAYABLE", "奖金尚未批准或已经发放");
    }

    public void requireReady(Long employeeId, Long periodId) {
        if (referrals.pendingBonus(tenantId(), employeeId, periodId) > 0) throw conflict("BONUS_APPROVAL_PENDING", "本周期内推奖金尚在审批，完成审批后才能生成工资");
    }

    public void postSalary(HrSalarySlip slip) {
        if (!Objects.equals(slip.getTenantId(), tenantId()) || !"PAID".equals(slip.getStatus())) throw forbidden();
        Set<Long> seen = new HashSet<>();
        for (Map<String, Object> item : slip.getComponents() == null ? List.<Map<String, Object>>of() : slip.getComponents()) {
            Long changeId = HrHSupport.number(item.get("changeId"));
            HrCompChange change = changeId == null ? null : changes.selectById(changeId);
            if (change == null || !TYPE.equals(change.getSourceBizType())) {
                if (TYPE.equals(item.get("sourceBizType"))) throw conflict("BONUS_SOURCE_CONFLICT", "工资中的奖金来源不存在");
                continue;
            }
            if (!seen.add(changeId)) throw conflict("BONUS_DUPLICATE_COMPONENT", "同一奖金在工资中出现多次");
            HrEmployeeReferral row = locked(HrHSupport.number(change.getSourceBizId()));
            Long periodId = HrHSupport.number(HrPayrollCalculationService.snapshot(slip).get("payrollPeriodId"));
            validateChange(row, change, slip.getEmployeeId(), periodId);
            if (!"EARNING".equals(item.get("type")) || new BigDecimal(String.valueOf(item.get("amount"))).compareTo(row.getBonusAmount()) != 0) throw conflict("BONUS_AMOUNT_CONFLICT", "工资奖金与核定金额不一致");
            Map<String, Object> paid = support.auditDetail(TYPE, row.getReferralId(), "BONUS_PAID");
            Map<String, Object> returned = support.auditDetail(TYPE, row.getReferralId(), "BONUS_SETTLEMENT_RETURNED");
            if ("PAID".equals(row.getBonusStatus())) {
                verifyPayment(row, changeId, slip, paid);
                if (paymentIdentity(paid).equals(returned.get("originalPaymentEventId"))) throw bonusReturnChanged();
                continue;
            }
            if (!"APPROVED".equals(row.getBonusStatus()) || paid.isEmpty() && !returned.isEmpty()) throw conflict("BONUS_STATE_CONFLICT", "奖金发放状态不一致");
            if (!paid.isEmpty()) verifyReturn(row, changeId, paid, returned);
            row.setBonusStatus("PAID"); row.setBonusPayDate(LocalDate.now()); save(row);
            Map<String, Object> payment = new LinkedHashMap<>();
            payment.put("salarySlipId", slip.getId()); payment.put("compChangeId", changeId); payment.put("payDate", row.getBonusPayDate().toString());
            payment.put("paymentEventId", UUID.randomUUID().toString()); payment.put("settlementId", slip.getReservedSettlementId());
            payment.put("amount", row.getBonusAmount().toPlainString());
            if (!paid.isEmpty()) payment.put("previousReturnedPaymentEventId", paymentIdentity(paid));
            support.audit(TYPE, row.getReferralId(), "BONUS_PAID", payment);
        }
    }

    /** The settlement owns source locks and verifies reverse money. Approval and original compensation are preserved. */
    void reverseSettlementSalaryLocked(HrSalarySlip slip, Long originalSettlementId, Long reversalId) {
        reverseSettlementSalaryLocked(slip, originalSettlementId, reversalId, true);
    }

    void reverseSettlementSalaryLocked(HrSalarySlip slip, Long originalSettlementId, Long reversalId, boolean apply) {
        if (!org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()
                || slip == null || !Objects.equals(tenantId(), slip.getTenantId()) || !"PAID".equals(slip.getStatus())
                || originalSettlementId == null || originalSettlementId <= 0 || !originalSettlementId.equals(slip.getReservedSettlementId())
                || reversalId == null || reversalId <= 0 || originalSettlementId.equals(reversalId)) throw bonusReturnChanged();
        Set<Long> seen = new HashSet<>();
        for (Map<String, Object> item : slip.getComponents() == null ? List.<Map<String, Object>>of() : slip.getComponents()) {
            Long changeId = HrHSupport.number(item.get("changeId"));
            HrCompChange change = changeId == null ? null : changes.selectById(changeId);
            if (change == null || !TYPE.equals(change.getSourceBizType())) {
                if (TYPE.equals(item.get("sourceBizType"))) throw bonusReturnChanged();
                continue;
            }
            if (!seen.add(changeId)) throw bonusReturnChanged();
            HrEmployeeReferral row = locked(HrHSupport.number(change.getSourceBizId()));
            validateChange(row, change, slip.getEmployeeId(), HrHSupport.number(HrPayrollCalculationService.snapshot(slip).get("payrollPeriodId")));
            if (!"EARNING".equals(item.get("type")) || row.getBonusAmount().compareTo(new BigDecimal(String.valueOf(item.get("amount")))) != 0) throw bonusReturnChanged();
            Map<String, Object> paid = support.auditDetail(TYPE, row.getReferralId(), "BONUS_PAID");
            Map<String, Object> returned = support.auditDetail(TYPE, row.getReferralId(), "BONUS_SETTLEMENT_RETURNED");
            if ("APPROVED".equals(row.getBonusStatus())) {
                verifyReturn(row, changeId, paid, returned);
                if (!Objects.equals(reversalId, HrHSupport.number(returned.get("reversalSettlementId")))
                        || !Objects.equals(originalSettlementId, HrHSupport.number(returned.get("originalSettlementId")))
                        || !Objects.equals(slip.getId(), HrHSupport.number(returned.get("salarySlipId"))) || row.getBonusPayDate() != null) throw bonusReturnChanged();
                continue;
            }
            if (!"PAID".equals(row.getBonusStatus())) throw bonusReturnChanged();
            verifyPayment(row, changeId, slip, paid);
            if (paymentIdentity(paid).equals(returned.get("originalPaymentEventId"))) throw bonusReturnChanged();
            if (!apply) continue;
            if (referrals.update(null, new LambdaUpdateWrapper<HrEmployeeReferral>().eq(HrEmployeeReferral::getTenantId, tenantId())
                    .eq(HrEmployeeReferral::getReferralId, row.getReferralId()).eq(HrEmployeeReferral::getVersion, row.getVersion())
                    .eq(HrEmployeeReferral::getBonusStatus, "PAID").set(HrEmployeeReferral::getBonusStatus, "APPROVED")
                    .set(HrEmployeeReferral::getBonusPayDate, null).set(HrEmployeeReferral::getUpdateBy, HrRuleSupport.userName())
                    .set(HrEmployeeReferral::getUpdateTime, HrHSupport.now()).setSql("version = version + 1")) != 1) throw bonusReturnChanged();
            support.audit(TYPE, row.getReferralId(), "BONUS_SETTLEMENT_RETURNED", Map.of("originalSettlementId", originalSettlementId,
                    "reversalSettlementId", reversalId, "salarySlipId", slip.getId(), "compChangeId", changeId,
                    "originalPaymentEventId", paymentIdentity(paid), "originalPayment", paid, "amount", row.getBonusAmount().toPlainString()));
        }
    }

    private static void verifyPayment(HrEmployeeReferral row, Long changeId, HrSalarySlip slip, Map<String, Object> paid) {
        paymentIdentity(paid);
        if (!Objects.equals(slip.getId(), HrHSupport.number(paid.get("salarySlipId")))) throw conflict("BONUS_ALREADY_PAID", "奖金已在另一张工资单发放");
        if (!Objects.equals(changeId, HrHSupport.number(paid.get("compChangeId"))) || row.getBonusPayDate() == null
                || !row.getBonusPayDate().toString().equals(paid.get("payDate"))
                || paid.containsKey("settlementId") && !Objects.equals(slip.getReservedSettlementId(), HrHSupport.number(paid.get("settlementId")))
                || paid.containsKey("amount") && !row.getBonusAmount().toPlainString().equals(paid.get("amount"))) throw bonusReturnChanged();
    }

    private static void verifyReturn(HrEmployeeReferral row, Long changeId, Map<String, Object> paid, Map<String, Object> returned) {
        if (!paymentIdentity(paid).equals(returned.get("originalPaymentEventId"))
                || !paid.equals(returned.get("originalPayment"))
                || !Objects.equals(changeId, HrHSupport.number(returned.get("compChangeId")))
                || !Objects.equals(HrHSupport.number(paid.get("salarySlipId")), HrHSupport.number(returned.get("salarySlipId")))
                || !row.getBonusAmount().toPlainString().equals(returned.get("amount"))
                || !positivePaymentId(returned.get("originalSettlementId")) || !positivePaymentId(returned.get("reversalSettlementId"))
                || Objects.equals(HrHSupport.number(returned.get("originalSettlementId")), HrHSupport.number(returned.get("reversalSettlementId")))) throw bonusReturnChanged();
        if (paid.containsKey("settlementId") && !Objects.equals(HrHSupport.number(paid.get("settlementId")), HrHSupport.number(returned.get("originalSettlementId")))) throw bonusReturnChanged();
    }

    private static String paymentIdentity(Map<String, Object> paid) {
        if (paid == null || !positivePaymentId(paid.get("salarySlipId")) || !positivePaymentId(paid.get("compChangeId"))
                || !(paid.get("payDate") instanceof String date) || !date.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) throw bonusReturnChanged();
        try { if (LocalDate.parse(date).getYear() < 1) throw bonusReturnChanged(); }
        catch (java.time.format.DateTimeParseException invalid) { throw bonusReturnChanged(); }
        if (paid.containsKey("paymentEventId")) {
            String eventId = String.valueOf(paid.get("paymentEventId"));
            try { if (!UUID.fromString(eventId).toString().equals(eventId)) throw bonusReturnChanged(); }
            catch (IllegalArgumentException invalid) { throw bonusReturnChanged(); }
            return eventId;
        }
        // Older successful payments precede event identifiers and could only be recorded once per referral.
        return "LEGACY:" + paid.get("salarySlipId") + ":" + paid.get("compChangeId") + ":" + date;
    }

    private static boolean positivePaymentId(Object value) {
        return value != null && String.valueOf(value).matches("[1-9][0-9]{0,18}") && HrHSupport.number(value) > 0;
    }

    private static HrHException bonusReturnChanged() {
        return conflict("BONUS_SETTLEMENT_RETURN_CONFLICT", "内推奖金原发放、结算返还或待发状态不一致");
    }

    public PageResult<HrEmployeeReferralMapper.Option> options(Long referralId, HrReferralRequests.Query query, boolean salaryComponents) {
        access.permission("hr:referral:bonus"); access.validate(query);
        return support.transaction(() -> {
            HrEmployeeReferral row = locked(referralId); access.scope(row.getReferrerEmployeeId());
            Page<HrEmployeeReferralMapper.Option> page = referrals.bonusOptions(new Page<>(query.getPageNum(), query.getPageSize()), tenantId(), query, salaryComponents);
            return new PageResult<>(page.getRecords(), page.getTotal(), query.getPageNum(), query.getPageSize());
        });
    }

    private void validateChange(HrEmployeeReferral row, HrCompChange change, Long employeeId, Long periodId) {
        ObjectNode snapshot = snapshot(row);
        if (!Objects.equals(change.getTenantId(), tenantId()) || !Integer.valueOf(0).equals(change.getDeleted()) || !"APPROVED".equals(change.getStatus())
                || !"REFERRAL_BONUS".equals(change.getChangeType()) || !Objects.equals(row.getCompChangeId(), change.getId())
                || !Objects.equals(row.getReferrerEmployeeId(), employeeId) || !Objects.equals(change.getEmployeeId(), employeeId)
                || !Objects.equals(periodId, change.getPayrollPeriodId()) || !Objects.equals(periodId, HrHSupport.number(snapshot.path("payrollPeriodId").asText()))
                || !Objects.equals(change.getSalaryComponentId(), HrHSupport.number(snapshot.path("salaryComponentId").asText()))
                || !Objects.equals(change.getProcessInstanceId(), row.getInstanceId()) || !"APPROVED".equals(snapshot.path("decision").asText())
                || change.getChangeAmount() == null || row.getBonusAmount() == null || change.getChangeAmount().compareTo(row.getBonusAmount()) != 0
                || row.getBonusAmount().compareTo(new BigDecimal(snapshot.path("amount").asText())) != 0) throw conflict("BONUS_SOURCE_CONFLICT", "奖金来源、审批、工资周期或金额不一致");
        component(change.getSalaryComponentId());
    }

    private HrCompChange sourceChange(Long id) {
        return changes.selectOne(new LambdaQueryWrapper<HrCompChange>().eq(HrCompChange::getTenantId, tenantId())
                .eq(HrCompChange::getSourceBizType, TYPE).eq(HrCompChange::getSourceBizId, id.toString()));
    }

    private boolean matches(HrEmployeeReferral row, HrReferralRequests.Bonus request, BigDecimal amount) {
        ObjectNode snapshot = snapshot(row);
        return row.getBonusAmount() != null && row.getBonusAmount().compareTo(amount) == 0
                && request.getSalaryComponentId().toString().equals(snapshot.path("salaryComponentId").asText())
                && request.getPayrollPeriodId().toString().equals(snapshot.path("payrollPeriodId").asText())
                && request.getConditionRemark().strip().equals(row.getBonusConditionRemark());
    }

    private HrCompComponent component(Long id) {
        HrCompComponent component = id == null ? null : components.selectById(id);
        if (component == null || !Objects.equals(component.getTenantId(), tenantId()) || !Integer.valueOf(1).equals(component.getStatus())
                || !"VARIABLE".equals(component.getComponentType()) || !Integer.valueOf(1).equals(component.getTaxable())) throw conflict("BONUS_COMPONENT_INVALID", "请选择启用且计税的变动薪资项目");
        return component;
    }

    private HrPayrollPeriod period(Long id) {
        HrPayrollPeriod period = id == null ? null : periods.selectById(id);
        if (period == null || !Objects.equals(period.getTenantId(), tenantId()) || !Integer.valueOf(0).equals(period.getDeleted())
                || !"OPEN".equals(period.getStatus())) throw conflict("BONUS_PERIOD_CLOSED", "请选择开放的工资周期");
        return period;
    }

    private HrEmployeeReferral locked(Long id) {
        HrEmployeeReferral row = id == null ? null : referrals.lockReferral(tenantId(), id);
        if (row == null) throw forbidden(); return row;
    }

    private HrEmployeeReferral lockForBonus(Long id) {
        HrEmployeeReferral original = id == null ? null : referrals.selectById(id);
        if (original == null || !Objects.equals(original.getTenantId(), tenantId())
                || referrals.lockReferrer(tenantId(), original.getReferrerEmployeeId()) == null) throw forbidden();
        HrEmployeeReferral row = locked(id);
        if (!Objects.equals(original.getReferrerEmployeeId(), row.getReferrerEmployeeId())) throw forbidden();
        return row;
    }

    private ObjectNode snapshot(HrEmployeeReferral row) {
        if (row.getBonusConditionSnapshot() == null || !row.getBonusConditionSnapshot().isObject()) throw conflict("BONUS_EVIDENCE_MISSING", "奖金缺少核定依据");
        return (ObjectNode) row.getBonusConditionSnapshot().deepCopy();
    }

    private void save(HrEmployeeReferral row) {
        if (referrals.updateById(row) != 1) throw conflict("VERSION_CONFLICT", "奖金记录已变化，请刷新重试");
    }
}
