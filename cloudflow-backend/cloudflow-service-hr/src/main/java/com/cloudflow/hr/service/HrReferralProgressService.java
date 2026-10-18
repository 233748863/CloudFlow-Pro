package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.entity.HrCandidate;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrEmployeeReferral;
import com.cloudflow.hr.domain.entity.HrInterview;
import com.cloudflow.hr.domain.entity.HrOffer;
import com.cloudflow.hr.mapper.HrCandidateMapper;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.cloudflow.hr.mapper.HrEmployeeReferralMapper;
import com.cloudflow.hr.mapper.HrOfferMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import static com.cloudflow.hr.service.HrHException.*;
import static com.cloudflow.hr.service.HrRuleSupport.tenantId;

@Service
@RequiredArgsConstructor
public class HrReferralProgressService {
    private final HrEmployeeReferralMapper referrals;
    private final HrCandidateMapper candidates;
    private final HrEmployeeMapper employees;
    private final HrOfferMapper offers;
    private final HrRuleSupport support;

    public void verifyCandidateWrite(HrCandidate candidate, HrCandidate previous) {
        if (previous == null && "REFERRAL".equals(candidate.getSource())) throw invalid("内推候选人须从推荐记录转换");
        if ("HIRED".equals(candidate.getStatus()) && (previous == null || !"HIRED".equals(previous.getStatus()))) {
            throw conflict("HIRING_EVIDENCE_REQUIRED", "已入职状态由实际入职办理产生");
        }
        if (previous != null && "HIRED".equals(previous.getStatus()) && !"HIRED".equals(candidate.getStatus())) {
            throw conflict("HIRED_CANDIDATE_IMMUTABLE", "已入职候选人的招聘结果不能改回其他状态");
        }
    }

    public void recruitmentChanged(Object entity) {
        if (entity instanceof HrCandidate candidate) {
            support.transaction(() -> { sync(candidate); return null; });
        } else if (entity instanceof HrInterview interview && interview.getCandidateId() != null
                && !"CANCELLED".equals(interview.getStatus())) {
            advance(interview.getCandidateId(), "INTERVIEW");
        } else if (entity instanceof HrOffer offer && offer.getCandidateId() != null
                && List.of("APPROVED", "SENT", "ACCEPTED").contains(Objects.toString(offer.getStatus(), ""))) {
            advance(offer.getCandidateId(), "OFFER");
        } else if (entity instanceof HrOffer offer && offer.getCandidateId() != null && "REJECTED".equals(offer.getStatus())) {
            advance(offer.getCandidateId(), "REJECTED");
        }
    }

    public boolean offerEmployment(HrOffer offer, HrEmployee employee) {
        return support.transaction(() -> {
            HrCandidate candidate = candidates.lockCandidate(tenantId(), offer.getCandidateId());
            if (candidate == null) throw forbidden();
            HrEmployeeReferral row = referrals.lockByCandidate(tenantId(), candidate.getId());
            if (row == null) return false;
            if (!Objects.equals(offer.getTenantId(), tenantId()) || !Objects.equals(employee.getTenantId(), tenantId())
                    || !"APPROVED".equals(offer.getStatus()) || offer.getProcessInstanceId() == null || offer.getProcessInstanceId().isBlank()
                    || employee.getHireDate() == null || employee.getUserId() == null || !Integer.valueOf(0).equals(employee.getDeleted())) {
                throw conflict("HIRING_EVIDENCE_REQUIRED", "录用审批及员工入职依据不完整");
            }
            Map<String, Object> previous = support.auditDetail("HR_REFERRAL", row.getReferralId(), "EMPLOYMENT_SOURCE");
            Map<String, Object> evidence = Map.of("offerId", offer.getId(), "instanceId", offer.getProcessInstanceId(),
                    "employeeId", employee.getId(), "userId", employee.getUserId(), "hireDate", employee.getHireDate().toString());
            if (!previous.isEmpty() && (!Objects.equals(HrHSupport.number(previous.get("employeeId")), employee.getId())
                    || !Objects.equals(HrHSupport.number(previous.get("offerId")), offer.getId()))) {
                throw conflict("HIRING_SOURCE_CONFLICT", "推荐已有不同的入职来源，请核对招聘记录");
            }
            if (previous.isEmpty()) support.audit("HR_REFERRAL", row.getReferralId(), "EMPLOYMENT_SOURCE", evidence);
            if (!"HIRED".equals(candidate.getStatus())) { candidate.setStatus("OFFER"); saveCandidate(candidate); }
            if (!List.of("HIRED", "OFFERED").contains(row.getStatus())) { row.setStatus("OFFERED"); save(row); }
            effective(candidate, row, previous.isEmpty() ? evidence : previous);
            return true;
        });
    }

    public int applyDueEmployment() {
        int changed = 0;
        Long cursor = 0L;
        while (true) {
            List<Long> candidateIds = referrals.pendingEmployment(tenantId(), cursor, 100);
            if (candidateIds.isEmpty()) return changed;
            for (Long candidateId : candidateIds) {
                changed += support.transaction(() -> {
                    HrCandidate candidate = candidates.lockCandidate(tenantId(), candidateId);
                    HrEmployeeReferral row = referrals.lockByCandidate(tenantId(), candidateId);
                    return candidate == null || row == null ? 0 : effective(candidate, row,
                            support.auditDetail("HR_REFERRAL", row.getReferralId(), "EMPLOYMENT_SOURCE"));
                });
                cursor = candidateId;
            }
        }
    }

    public Map<String, Object> requireEmployment(HrEmployeeReferral row) {
        Map<String, Object> evidence = support.auditDetail("HR_REFERRAL", row.getReferralId(), "EMPLOYMENT_SOURCE");
        HrEmployee employee = validEmployee(row, evidence);
        if (!"HIRED".equals(row.getStatus()) || employee == null || employee.getHireDate().isAfter(LocalDate.now())
                || !Objects.equals(row.getHireDate(), employee.getHireDate())) throw conflict("HIRING_EVIDENCE_REQUIRED", "推荐尚无已生效的真实入职依据");
        return evidence;
    }

    private int effective(HrCandidate candidate, HrEmployeeReferral row, Map<String, Object> evidence) {
        if ("HIRED".equals(row.getStatus()) || "REJECTED".equals(row.getStatus())) return 0;
        HrEmployee employee = validEmployee(row, evidence);
        if (employee == null || employee.getHireDate().isAfter(LocalDate.now())) return 0;
        boolean hired = "HIRED".equals(candidate.getStatus());
        candidate.setStatus("HIRED"); saveCandidate(candidate);
        row.setStatus("HIRED"); row.setHireDate(employee.getHireDate()); save(row);
        if (!hired && candidate.getRequisitionId() != null) referrals.incrementHired(tenantId(), candidate.getRequisitionId());
        support.audit("HR_REFERRAL", row.getReferralId(), "EMPLOYMENT_EFFECTIVE", Map.of("employeeId", employee.getId(), "hireDate", employee.getHireDate().toString()));
        return 1;
    }

    private HrEmployee validEmployee(HrEmployeeReferral row, Map<String, Object> evidence) {
        Long employeeId = HrHSupport.number(evidence.get("employeeId"));
        Long offerId = HrHSupport.number(evidence.get("offerId"));
        if (employeeId == null || offerId == null) return null;
        HrEmployee employee = employees.selectById(employeeId);
        HrOffer offer = offers.selectById(offerId);
        if (employee == null || offer == null || !Objects.equals(employee.getTenantId(), tenantId()) || !Objects.equals(offer.getTenantId(), tenantId())
                || !Integer.valueOf(0).equals(employee.getDeleted()) || !Integer.valueOf(0).equals(offer.getDeleted())
                || !List.of("PROBATION", "REGULAR").contains(Objects.toString(employee.getEmployeeStatus(), ""))
                || !List.of("APPROVED", "SENT", "ACCEPTED").contains(Objects.toString(offer.getStatus(), "")) || !Objects.equals(row.getCandidateId(), offer.getCandidateId())
                || !Objects.equals(offer.getProcessInstanceId(), evidence.get("instanceId"))
                || !Objects.equals(employee.getUserId(), HrHSupport.number(evidence.get("userId")))
                || employee.getHireDate() == null || !employee.getHireDate().toString().equals(evidence.get("hireDate"))) return null;
        return employee;
    }

    private void advance(Long candidateId, String status) {
        support.transaction(() -> {
            HrCandidate candidate = candidates.lockCandidate(tenantId(), candidateId);
            if (candidate == null || referrals.lockByCandidate(tenantId(), candidateId) == null) return null;
            if (List.of("HIRED", "REJECTED").contains(candidate.getStatus()) || "OFFER".equals(candidate.getStatus()) && "INTERVIEW".equals(status)) return null;
            candidate.setStatus(status); saveCandidate(candidate); sync(candidate); return null;
        });
    }

    private void sync(HrCandidate candidate) {
        HrEmployeeReferral row = referrals.lockByCandidate(tenantId(), candidate.getId());
        if (row == null || "HIRED".equals(row.getStatus())) return;
        String status = switch (Objects.toString(candidate.getStatus(), "")) {
            case "NEW", "SCREENING" -> "SCREENING";
            case "INTERVIEW" -> "INTERVIEWING";
            case "OFFER" -> "OFFERED";
            case "REJECTED" -> "REJECTED";
            default -> null;
        };
        if (status != null && !status.equals(row.getStatus())) {
            row.setStatus(status); save(row);
            support.audit("HR_REFERRAL", row.getReferralId(), "RECRUITMENT_PROGRESS", Map.of("candidateId", candidate.getId(), "status", status));
        }
    }

    private void save(HrEmployeeReferral row) {
        if (referrals.updateById(row) != 1) throw conflict("VERSION_CONFLICT", "推荐进度已变化，请重试");
    }

    private void saveCandidate(HrCandidate candidate) {
        if (candidates.updateById(candidate) != 1) throw conflict("VERSION_CONFLICT", "候选人进度已变化，请重试");
    }
}
