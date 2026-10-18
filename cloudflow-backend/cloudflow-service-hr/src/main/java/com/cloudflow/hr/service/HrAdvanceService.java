package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.hr.domain.dto.HrAdvanceRequests;
import com.cloudflow.hr.domain.entity.HrAdvanceRepayment;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrEmployeeAdvance;
import com.cloudflow.hr.domain.vo.advance.HrAdvanceViews;
import com.cloudflow.hr.mapper.HrAdvanceRepaymentMapper;
import com.cloudflow.hr.mapper.HrEmployeeAdvanceMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import static com.cloudflow.hr.service.HrHException.conflict;
import static com.cloudflow.hr.service.HrHException.forbidden;
import static com.cloudflow.hr.service.HrHException.invalid;
import static com.cloudflow.hr.service.HrRuleSupport.tenantId;
import static com.cloudflow.hr.service.HrRuleSupport.userName;

@Service
@RequiredArgsConstructor
public class HrAdvanceService {
    private final HrEmployeeAdvanceMapper advances;
    private final HrAdvanceRepaymentMapper repayments;
    private final HrAdvanceLedgerService ledger;
    private final HrAdvanceProofService proofs;
    private final HrHSupport access;
    private final HrRuleSupport support;

    public PageResult<HrAdvanceViews.Summary> list(HrAdvanceRequests.Query query, boolean mine) {
        access.permission(mine ? "hr:advance:own" : "hr:advance:list");
        access.validate(query);
        if (mine) query.setEmployeeId(access.mine().getId());
        HrEmployeeAdvanceMapper.EmployeeScope scope = scope(mine);
        Page<HrEmployeeAdvance> page = advances.pageAdvances(new Page<>(query.getPageNum(), query.getPageSize()), tenantId(), query, scope);
        return new PageResult<>(page.getRecords().stream().map(this::summary).toList(), page.getTotal(), page.getCurrent(), page.getSize());
    }

    public HrAdvanceViews.Detail detail(Long advanceId, boolean mine) {
        HrEmployeeAdvance advance = visible(advanceId, mine);
        boolean owner = access.owner(advance.getEmployeeId());
        boolean funded = advance.getPaidTime() != null && List.of("PAID", "REPAYING").contains(advance.getStatus());
        return new HrAdvanceViews.Detail(summary(advance), repaymentPage(advanceId, new HrAdvanceRequests.Query(), mine),
                owner && access.permitted("hr:advance:apply") && "APPLYING".equals(advance.getStatus()) && "DRAFT".equals(advance.getApprovalStatus()),
                !owner && funded && access.permitted("hr:advance:repay"),
                !owner && funded && access.permitted("hr:advance:writeoff") && advance.getReservedAmount().signum() == 0);
    }

    public PageResult<HrAdvanceViews.Repayment> repaymentList(Long advanceId, HrAdvanceRequests.Query query, boolean mine) {
        visible(advanceId, mine);
        access.validate(query);
        return repaymentPage(advanceId, query, mine);
    }

    @Audit(name = "保存本人借款草稿")
    public Long create(HrAdvanceRequests.Draft input, String requestKey) {
        access.permission("hr:advance:apply");
        access.validate(input);
        if (input.getVersion() != null) throw invalid("新建借款不能指定版本");
        HrEmployee employee = access.mine();
        String key = HrHSupport.key(requestKey);
        String advanceNo = "AD-" + access.digest(List.of(tenantId(), employee.getId(), key)).substring(0, 48);
        return support.transaction(() -> {
            lockEmployee(employee.getId());
            if (!Objects.equals(access.mine().getId(), employee.getId())) throw forbidden();
            HrEmployeeAdvance previous = advances.selectOne(new LambdaQueryWrapper<HrEmployeeAdvance>()
                    .eq(HrEmployeeAdvance::getTenantId, tenantId()).eq(HrEmployeeAdvance::getAdvanceNo, advanceNo));
            LocalDate applicationDate = previous == null ? HrHSupport.today() : previous.getApplyDate();
            HrAdvanceDraftRules.Plan plan = HrAdvanceDraftRules.plan(input, applicationDate);
            String digest = access.digest(plan);
            if (previous != null) {
                Map<String, Object> creation = support.auditDetail("HR_ADVANCE", previous.getAdvanceId(), "CREATE");
                if (!Objects.equals(previous.getEmployeeId(), employee.getId()) || !digest.equals(creation.get("requestDigest"))) {
                    throw conflict("ADVANCE_CREATE_CONFLICT", "同一创建请求已有不同内容，请核对原借款");
                }
                return previous.getAdvanceId();
            }
            HrEmployeeAdvance advance = new HrEmployeeAdvance();
            advance.setTenantId(tenantId()); advance.setEmployeeId(employee.getId()); advance.setAdvanceNo(advanceNo);
            applyPlan(advance, plan); advance.setApplyDate(applicationDate);
            advance.setRepaidAmount(BigDecimal.ZERO); advance.setOutstandingAmount(BigDecimal.ZERO);
            advance.setReservedAmount(BigDecimal.ZERO); advance.setWrittenOffAmount(BigDecimal.ZERO);
            advance.setStatus("APPLYING"); advance.setApprovalStatus("DRAFT"); advance.setVersion(0);
            advance.setCreateBy(userName()); advance.setCreateTime(HrHSupport.now());
            advance.setUpdateBy(userName()); advance.setUpdateTime(HrHSupport.now());
            if (advances.insert(advance) != 1) throw conflict("ADVANCE_CREATE_CONFLICT", "借款草稿未保存，请重试原请求");
            support.audit("HR_ADVANCE", advance.getAdvanceId(), "CREATE", Map.of("requestDigest", digest,
                    "employeeId", employee.getId(), "plan", plan));
            return advance.getAdvanceId();
        });
    }

    @Audit(name = "修改本人借款草稿", spel = "#advanceId")
    public void update(Long advanceId, HrAdvanceRequests.Draft input) {
        access.permission("hr:advance:apply");
        access.validate(input);
        access.own(advance(advanceId).getEmployeeId());
        ledger.withAdvanceLock(advanceId, current -> {
            if (!Objects.equals(access.mine().getId(), current.getEmployeeId())) throw forbidden();
            HrHSupport.version(input.getVersion(), current.getVersion());
            draft(current);
            HrAdvanceDraftRules.Plan plan = HrAdvanceDraftRules.plan(input, current.getApplyDate());
            if (advances.updateDraft(tenantId(), advanceId, plan, input.getVersion(), userName()) != 1) {
                throw conflict("VERSION_CONFLICT", "借款已经变化，请刷新后重试");
            }
            support.audit("HR_ADVANCE", advanceId, "UPDATE", Map.of("version", input.getVersion() + 1, "plan", plan));
            return null;
        });
    }

    public HrAdvanceViews.Proof uploadProof(Long advanceId, MultipartFile file) {
        finance(advance(advanceId), "hr:advance:repay");
        return ledger.withAdvanceLock(advanceId, current -> {
            finance(current, "hr:advance:repay");
            if (ledger.verifiedBalance(current).available().signum() <= 0) throw conflict("ADVANCE_NO_AVAILABLE_BALANCE", "没有可人工归还的本金");
            return proofs.save(advanceId, file);
        });
    }

    @Audit(name = "财务登记借款实际还款", spel = "#advanceId", highRisk = true)
    public Long repay(Long advanceId, HrAdvanceRequests.Repayment input) {
        access.validate(input);
        finance(advance(advanceId), "hr:advance:repay");
        return ledger.withAdvanceLock(advanceId, current -> {
            finance(current, "hr:advance:repay");
            proofs.requireOwned(advanceId, input.getProofFileId(), input.getSourceEventKey());
            return ledger.repayManual(advanceId, input).getRepaymentId();
        });
    }

    @Audit(name = "财务核销借款本金", spel = "#advanceId", highRisk = true)
    public void writeoff(Long advanceId, HrAdvanceRequests.Writeoff input) {
        access.validate(input);
        finance(advance(advanceId), "hr:advance:writeoff");
        ledger.withAdvanceLock(advanceId, current -> {
            finance(current, "hr:advance:writeoff");
            ledger.writeoff(advanceId, input);
            return null;
        });
    }

    public ResponseEntity<byte[]> downloadProof(Long advanceId, Long fileId) {
        HrEmployeeAdvance initial = advance(advanceId);
        boolean mine = access.owner(initial.getEmployeeId()) && access.permitted("hr:advance:own");
        visible(advanceId, mine);
        return ledger.withAdvanceLock(advanceId, current -> {
            visible(advanceId, mine);
            return proofs.download(advanceId, fileId);
        });
    }

    public void authorizeProofDownload(Long advanceId, Long fileId) {
        HrEmployeeAdvance initial = advance(advanceId);
        boolean mine = access.owner(initial.getEmployeeId()) && access.permitted("hr:advance:own");
        visible(advanceId, mine);
        ledger.withAdvanceLock(advanceId, current -> {
            visible(advanceId, mine);
            proofs.authorizeDownload(advanceId, fileId);
            return null;
        });
    }

    private HrEmployeeAdvance visible(Long advanceId, boolean mine) {
        access.permission(mine ? "hr:advance:own" : "hr:advance:list");
        HrEmployeeAdvance advance = advance(advanceId);
        if (mine) {
            if (!Objects.equals(access.mine().getId(), advance.getEmployeeId())) throw forbidden();
        } else access.scope(advance.getEmployeeId());
        return advance;
    }

    private void finance(HrEmployeeAdvance advance, String permission) { access.operator(advance.getEmployeeId(), permission); }

    private HrEmployeeAdvance advance(Long advanceId) {
        HrEmployeeAdvance advance = advanceId == null || advanceId <= 0 ? null : advances.selectOne(new LambdaQueryWrapper<HrEmployeeAdvance>()
                .eq(HrEmployeeAdvance::getTenantId, tenantId()).eq(HrEmployeeAdvance::getAdvanceId, advanceId));
        if (advance == null) throw new HrHException("ADVANCE_NOT_FOUND", "借款不存在", 404);
        return advance;
    }

    private void lockEmployee(Long employeeId) {
        if (advances.lockEmployee(tenantId(), employeeId) == null) throw new HrHException("EMPLOYEE_NOT_FOUND", "员工不存在", 404);
    }

    private void draft(HrEmployeeAdvance advance) {
        if (!"APPLYING".equals(advance.getStatus()) || !"DRAFT".equals(advance.getApprovalStatus())
                || advance.getInstanceId() != null || advance.getPaymentRequestId() != null || advance.getPaidTime() != null
                || advance.getRepaidAmount().signum() != 0 || advance.getOutstandingAmount().signum() != 0
                || advance.getReservedAmount().signum() != 0 || advance.getWrittenOffAmount().signum() != 0) {
            throw conflict("ADVANCE_DRAFT_REQUIRED", "仅未提交且尚无放款或还款事实的本人草稿可以修改");
        }
    }

    private HrEmployeeAdvanceMapper.EmployeeScope scope(boolean mine) {
        Long userId = access.user();
        if (!mine && UserContext.getDsType() == null) throw forbidden();
        return new HrEmployeeAdvanceMapper.EmployeeScope(mine ? 4 : UserContext.getDsType(), userId,
                UserContext.getDeptId(), List.copyOf(UserContext.getDsDeptIds()));
    }

    private PageResult<HrAdvanceViews.Repayment> repaymentPage(Long advanceId, HrAdvanceRequests.Query query, boolean mine) {
        Page<HrAdvanceRepayment> page = repayments.selectPage(new Page<>(query.getPageNum(), query.getPageSize()),
                new LambdaQueryWrapper<HrAdvanceRepayment>().eq(HrAdvanceRepayment::getTenantId, tenantId())
                        .eq(HrAdvanceRepayment::getAdvanceId, advanceId).orderByDesc(HrAdvanceRepayment::getRepaymentId));
        List<HrAdvanceViews.Repayment> rows = page.getRecords().stream().map(entry -> new HrAdvanceViews.Repayment(entry.getRepaymentId(),
                amount(entry.getRepayAmount()), entry.getRepayMonth(), entry.getRepayType(), entry.getStatus(), entry.getReversalOfId(),
                entry.getRepayDate(), entry.getPostedTime(), entry.getProofFileId(), mine ? null : entry.getRemark(),
                mine ? null : entry.getSourceEventKey())).toList();
        return new PageResult<>(rows, page.getTotal(), page.getCurrent(), page.getSize());
    }

    private HrAdvanceViews.Summary summary(HrEmployeeAdvance advance) {
        return new HrAdvanceViews.Summary(advance.getAdvanceId(), advance.getAdvanceNo(), advance.getEmployeeId(),
                access.employee(advance.getEmployeeId()).getName(), amount(advance.getAdvanceAmount()), advance.getPurpose(),
                advance.getApplyDate(), advance.getRepayMode(), advance.getRepayStartMonth(), advance.getRepayMonths(),
                amount(advance.getMonthlyDeductAmount()), amount(advance.getRepaidAmount()), amount(advance.getOutstandingAmount()),
                amount(advance.getReservedAmount()), amount(advance.getWrittenOffAmount()), advance.getStatus(), advance.getApprovalStatus(),
                advance.getPaidTime(), advance.getVersion());
    }

    private static void applyPlan(HrEmployeeAdvance advance, HrAdvanceDraftRules.Plan plan) {
        advance.setAdvanceAmount(plan.amount()); advance.setPurpose(plan.purpose()); advance.setRepayMode(plan.repayMode());
        advance.setRepayStartMonth(plan.repayStartMonth()); advance.setRepayMonths(plan.repayMonths()); advance.setMonthlyDeductAmount(plan.monthlyDeductAmount());
    }

    private static String amount(BigDecimal value) { return value == null ? null : value.toPlainString(); }
}
