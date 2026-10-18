package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.sensitive.utils.SensitiveUtils;
import com.cloudflow.hr.domain.dto.HrReferralRequests;
import com.cloudflow.hr.domain.entity.HrCandidate;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrEmployeeReferral;
import com.cloudflow.hr.domain.entity.HrRecruitmentRequisition;
import com.cloudflow.hr.mapper.HrCandidateMapper;
import com.cloudflow.hr.mapper.HrEmployeeReferralMapper;
import com.cloudflow.hr.mapper.HrRecruitmentRequisitionMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import static com.cloudflow.hr.service.HrHException.*;
import static com.cloudflow.hr.service.HrRuleSupport.tenantId;
import static com.cloudflow.hr.service.HrRuleSupport.userName;

@Service
@RequiredArgsConstructor
public class HrReferralService {
    private final HrEmployeeReferralMapper referrals;
    private final HrCandidateMapper candidates;
    private final HrRecruitmentRequisitionMapper requisitions;
    private final HrRecruitmentIdentityService identities;
    private final HrReferralResumeService resumes;
    private final HrHSupport access;
    private final HrRuleSupport support;

    public record View(Long referralId, String referralNo, String candidateName, String contactPhone, String email,
            Long targetPositionId, String status, LocalDate hireDate, String bonusStatus, BigDecimal bonusAmount,
            LocalDate bonusPayDate, Integer version, LocalDateTime createTime, Long candidateId,
            String referrerName, String referralReason, String currentEmployer, String currentJobTitle,
            boolean bonusCanSubmit, String bonusDecision, String bonusConditionRemark, Long resumeFileId) { }

    public PageResult<View> list(HrReferralRequests.Query query, boolean mine) {
        access.permission(mine ? "hr:referral:own" : "hr:referral:list"); access.validate(query);
        Long employeeId = mine ? access.mine().getId() : null;
        HrEmployeeReferralMapper.Scope scope = mine ? null : scope();
        Page<HrEmployeeReferral> page = referrals.pageReferrals(new Page<>(query.getPageNum(), query.getPageSize()), tenantId(), query, employeeId, scope);
        return new PageResult<>(page.getRecords().stream().map(row -> view(row, mine)).toList(), page.getTotal(), query.getPageNum(), query.getPageSize());
    }

    public View detail(Long referralId, boolean mine) {
        access.permission(mine ? "hr:referral:own" : "hr:referral:list");
        return support.transaction(() -> view(visible(referralId, mine), mine));
    }

    public PageResult<HrEmployeeReferralMapper.Option> positions(HrReferralRequests.Query query) {
        access.permission("hr:referral:submit"); access.validate(query); access.mine();
        Page<HrEmployeeReferralMapper.Option> page = referrals.positionOptions(new Page<>(query.getPageNum(), query.getPageSize()), tenantId(), query);
        return new PageResult<>(page.getRecords(), page.getTotal(), query.getPageNum(), query.getPageSize());
    }

    public PageResult<HrEmployeeReferralMapper.Option> requisitions(Long referralId, HrReferralRequests.Query query) {
        access.permission("hr:referral:convert"); access.validate(query);
        return support.transaction(() -> {
            HrEmployeeReferral row = visible(referralId, false);
            Page<HrEmployeeReferralMapper.Option> page = referrals.requisitionOptions(new Page<>(query.getPageNum(), query.getPageSize()), tenantId(), row.getTargetPositionId(), query, scope());
            return new PageResult<>(page.getRecords(), page.getTotal(), query.getPageNum(), query.getPageSize());
        });
    }

    @Audit(name = "员工提交本人推荐", spel = "#request.resumeFileId")
    public View submit(HrReferralRequests.Submit request) {
        access.permission("hr:referral:submit"); access.validate(request);
        HrEmployee referrer = access.mine();
        HrRecruitmentContacts.Contacts contacts = HrRecruitmentContacts.normalize(tenantId(), request.getContactPhone(), request.getEmail(), true);
        return support.transaction(() -> {
            if (referrals.activePosition(tenantId(), request.getTargetPositionId()) == null) throw invalid("目标岗位不存在或未启用");
            HrEmployeeReferral row = new HrEmployeeReferral();
            row.setTenantId(tenantId()); row.setReferralNo("REF" + UUID.randomUUID().toString().replace("-", ""));
            row.setReferrerEmployeeId(referrer.getId()); row.setReferrerName(referrer.getName());
            row.setCandidateName(request.getCandidateName().strip()); row.setContactPhone(contacts.phone()); row.setEmail(contacts.email());
            row.setTargetPositionId(request.getTargetPositionId()); row.setResumeFileId(request.getResumeFileId());
            row.setCurrentEmployer(request.getCurrentEmployer()); row.setCurrentJobTitle(request.getCurrentJobTitle());
            row.setReferralReason(request.getReferralReason()); row.setStatus("SUBMITTED"); row.setBonusApplicableFlag(0);
            row.setBonusStatus("NOT_APPLICABLE"); row.setVersion(0); row.setCreateBy(userName()); row.setUpdateBy(userName());
            if (referrals.insert(row) != 1) throw conflict("REFERRAL_SAVE_FAILED", "推荐保存失败");
            resumes.bind(row.getReferralId(), row.getResumeFileId(), referrer.getId());
            if (!identities.occupyReferral(contacts, row.getReferralId())) { row.setStatus("DUPLICATE"); save(row); }
            support.audit("HR_REFERRAL", row.getReferralId(), "SUBMIT", Map.of("status", row.getStatus(), "referrerEmployeeId", referrer.getId()));
            return view(row, true);
        });
    }

    @Audit(name = "核对内推初筛", spel = "#referralId")
    public View screening(Long referralId, HrReferralRequests.Screening request) {
        access.permission("hr:referral:manage"); access.validate(request);
        return support.transaction(() -> {
            HrEmployeeReferral row = visible(referralId, false); HrHSupport.version(request.getVersion(), row.getVersion());
            if (!List.of("SUBMITTED", "SCREENING").contains(row.getStatus()) || row.getCandidateId() != null) throw conflict("REFERRAL_STATE", "当前推荐不能修改初筛结果");
            row.setStatus(request.getAccepted() ? "SCREENING" : "REJECTED"); save(row);
            support.audit("HR_REFERRAL", referralId, "SCREENING", Map.of("accepted", request.getAccepted(), "reason", request.getReason()));
            return view(row, false);
        });
    }

    @Audit(name = "推荐转换候选人", spel = "#referralId")
    public Long convert(Long referralId, HrReferralRequests.Convert request) {
        access.permission("hr:referral:convert"); access.validate(request);
        return support.transaction(() -> {
            HrEmployeeReferral row = visible(referralId, false);
            if (row.getCandidateId() != null) { identities.requireCandidate(row.getCandidateId()); return row.getCandidateId(); }
            HrHSupport.version(request.getVersion(), row.getVersion());
            if (!"SCREENING".equals(row.getStatus())) throw conflict("REFERRAL_STATE", "初筛通过后才能转为候选人");
            HrRecruitmentRequisition requisition = requisitions.selectById(request.getRequisitionId());
            if (requisition == null || !Objects.equals(tenantId(), requisition.getTenantId()) || !Integer.valueOf(0).equals(requisition.getDeleted())
                    || !"RECRUITING".equals(requisition.getStatus()) || !Objects.equals(requisition.getPositionId(), row.getTargetPositionId())) throw invalid("请选择目标岗位正在招聘的需求");
            requireDepartment(requisition.getDeptId());
            HrCandidate candidate = new HrCandidate(); candidate.setTenantId(tenantId());
            candidate.setCandidateNo("CAN" + UUID.randomUUID().toString().replace("-", "")); candidate.setName(row.getCandidateName());
            candidate.setPhone(row.getContactPhone()); candidate.setEmail(row.getEmail()); candidate.setRequisitionId(requisition.getId());
            candidate.setSource("REFERRAL"); candidate.setStatus("SCREENING"); candidate.setDeleted(0); candidate.setVersion(0);
            candidate.setCreateBy(userName()); candidate.setUpdateBy(userName());
            if (candidates.insert(candidate) != 1) throw conflict("REFERRAL_CONVERT_FAILED", "候选人创建失败");
            identities.attachCandidate(referralId, candidate); row.setCandidateId(candidate.getId()); save(row);
            support.audit("HR_REFERRAL", referralId, "CONVERT", Map.of("candidateId", candidate.getId(), "requisitionId", requisition.getId()));
            return candidate.getId();
        });
    }

    public ResponseEntity<byte[]> download(Long referralId, boolean mine) {
        return download(referralId, mine, null);
    }

    public void authorizeDownload(Long referralId, Long fileId, boolean mine) {
        access.permission(mine ? "hr:referral:own" : "hr:referral:list");
        support.transaction(() -> {
            HrEmployeeReferral row = visible(referralId, mine);
            if (!Objects.equals(fileId, row.getResumeFileId())) throw forbidden();
            if (!mine && row.getCandidateId() != null) {
                access.permission("hr:recruitment:list"); identities.requireCandidate(row.getCandidateId());
            }
            resumes.authorizeDownload(referralId, fileId);
            return null;
        });
    }

    public ResponseEntity<byte[]> download(Long referralId, boolean mine, Long expectedFileId) {
        access.permission(mine ? "hr:referral:own" : "hr:referral:list");
        return support.transaction(() -> {
            HrEmployeeReferral row = visible(referralId, mine);
            if (expectedFileId != null && !Objects.equals(expectedFileId, row.getResumeFileId())) throw forbidden();
            if (!mine && row.getCandidateId() != null) {
                access.permission("hr:recruitment:list"); identities.requireCandidate(row.getCandidateId());
            }
            return resumes.download(referralId, row.getResumeFileId());
        });
    }

    private HrEmployeeReferral visible(Long referralId, boolean mine) {
        HrEmployeeReferral row = referrals.lockReferral(tenantId(), referralId);
        if (row == null) throw forbidden();
        if (mine) access.own(row.getReferrerEmployeeId()); else access.scope(row.getReferrerEmployeeId());
        return row;
    }

    private HrEmployeeReferralMapper.Scope scope() {
        if (UserContext.getDsType() == null) throw forbidden();
        return new HrEmployeeReferralMapper.Scope(UserContext.getDsType(), UserContext.getDeptId(), UserContext.getDsDeptIds());
    }

    private void requireDepartment(Long departmentId) {
        HrEmployeeReferralMapper.Scope scope = scope();
        if (scope.type() == 0 || departmentId != null && (scope.type() == 3 && Objects.equals(scope.departmentId(), departmentId)
                || (scope.type() == 1 || scope.type() == 2) && scope.departmentIds().contains(departmentId))) return;
        throw forbidden();
    }

    private void save(HrEmployeeReferral row) {
        row.setUpdateBy(userName());
        if (referrals.updateById(row) != 1) throw conflict("VERSION_CONFLICT", "推荐已变化，请刷新后重试");
    }

    private View view(HrEmployeeReferral row, boolean mine) {
        return new View(row.getReferralId(), row.getReferralNo(), row.getCandidateName(), SensitiveUtils.maskByFieldName("phone", row.getContactPhone()),
                SensitiveUtils.maskByFieldName("email", row.getEmail()), row.getTargetPositionId(), row.getStatus(), row.getHireDate(), row.getBonusStatus(),
                row.getBonusAmount(), row.getBonusPayDate(), row.getVersion(), row.getCreateTime(), mine ? null : row.getCandidateId(),
                mine ? null : row.getReferrerName(), row.getReferralReason(), row.getCurrentEmployer(), row.getCurrentJobTitle(),
                !mine && "HIRED".equals(row.getStatus()) && "NOT_APPLICABLE".equals(row.getBonusStatus()) && row.getInstanceId() == null,
                row.getBonusConditionSnapshot() == null ? null : row.getBonusConditionSnapshot().path("decision").asText(null), row.getBonusConditionRemark(), row.getResumeFileId());
    }
}
