package com.cloudflow.hr.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.hr.domain.entity.HrCandidate;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrCandidateMapper;
import com.cloudflow.hr.mapper.HrRecruitmentIdentityMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.Objects;
import java.util.Comparator;
import java.util.stream.Stream;

import static com.cloudflow.hr.service.HrHException.conflict;
import static com.cloudflow.hr.service.HrHException.forbidden;
import static com.cloudflow.hr.service.HrRuleSupport.tenantId;
import static com.cloudflow.hr.service.HrRuleSupport.userName;

@Service
@RequiredArgsConstructor
public class HrRecruitmentIdentityService {
    private final HrRecruitmentIdentityMapper identities;
    private final HrCandidateMapper candidates;
    private final PlatformTransactionManager transactions;

    public HrCandidate requireCandidate(Long candidateId) {
        HrCandidate candidate = candidateId == null ? null : candidates.selectById(candidateId);
        if (candidate == null || !Objects.equals(candidate.getTenantId(), tenantId()) || !Integer.valueOf(0).equals(candidate.getDeleted())) throw forbidden();
        if (UserContext.getUserId() == null || !Objects.equals(UserContext.getTenantId(), tenantId())) throw forbidden();
        Integer scope = UserContext.getDsType();
        if (scope == null) throw forbidden();
        if (scope == 0) return candidate;
        if (scope == 4 && Objects.equals(candidate.getCreateBy(), UserContext.getUserName())) return candidate;
        Long department = identities.candidateDepartment(tenantId(), candidateId);
        if (department != null && ((scope == 1 || scope == 2) && UserContext.getDsDeptIds().contains(department)
                || scope == 3 && Objects.equals(department, UserContext.getDeptId()))) return candidate;
        throw forbidden();
    }

    public void prepareCandidate(HrCandidate candidate, HrCandidate previous) {
        if (!Objects.equals(candidate.getTenantId(), tenantId())) throw forbidden();
        String phone = candidate.getPhone();
        try { candidate.setPhone(HrRecruitmentContacts.phone(phone)); }
        catch (IllegalArgumentException failure) {
            if (previous == null || !Objects.equals(phone, previous.getPhone())) throw failure;
        }
        candidate.setEmail(HrRecruitmentContacts.email(candidate.getEmail()));
    }

    public void occupyCandidate(HrCandidate candidate) {
        occupy(candidateContacts(candidate), null, candidate.getId());
    }

    public void occupyCandidateHistory(HrCandidate candidate, HrCandidate previous) {
        HrRecruitmentContacts.Contacts current = candidateContacts(candidate);
        HrRecruitmentContacts.Contacts original = candidateContacts(previous);
        occupy(new HrRecruitmentContacts.Contacts(current.phone(), current.email(), Stream.concat(current.identities().stream(), original.identities().stream())
                .distinct().sorted(Comparator.comparing(HrRecruitmentContacts.Identity::type).thenComparing(HrRecruitmentContacts.Identity::hash)).toList()), null, candidate.getId());
    }

    private HrRecruitmentContacts.Contacts candidateContacts(HrCandidate candidate) {
        if (candidate == null || candidate.getId() == null || !Objects.equals(candidate.getTenantId(), tenantId())) throw forbidden();
        String phone;
        try { phone = HrRecruitmentContacts.phone(candidate.getPhone()); }
        catch (IllegalArgumentException legacyWithoutCountry) { phone = null; }
        return HrRecruitmentContacts.normalize(tenantId(), phone, candidate.getEmail(), false);
    }

    public boolean occupyReferral(HrRecruitmentContacts.Contacts contacts, Long referralId) {
        requireTransaction();
        TransactionTemplate nested = new TransactionTemplate(transactions);
        nested.setPropagationBehavior(TransactionDefinition.PROPAGATION_NESTED);
        try {
            nested.execute(status -> { occupy(contacts, referralId, null); return null; });
            return true;
        } catch (IdentityConflict duplicate) { return false; }
    }

    public void attachCandidate(Long referralId, HrCandidate candidate) {
        requireTransaction();
        if (referralId == null || candidate.getId() == null || !Objects.equals(candidate.getTenantId(), tenantId())) throw forbidden();
        HrRecruitmentContacts.Contacts contacts = HrRecruitmentContacts.normalize(tenantId(), candidate.getPhone(), candidate.getEmail(), true);
        occupy(contacts, referralId, candidate.getId());
        identities.attachCandidate(tenantId(), referralId, candidate.getId(), userName());
    }

    private void occupy(HrRecruitmentContacts.Contacts contacts, Long referralId, Long candidateId) {
        requireTransaction();
        if (referralId == null && candidateId == null) throw conflict("RECRUITMENT_OWNER_REQUIRED", "招聘身份缺少来源");
        for (HrRecruitmentContacts.Identity identity : contacts.identities()) {
            identities.occupy(tenantId(), identity.type(), identity.hash(), referralId, candidateId, userName());
            HrRecruitmentIdentityMapper.Owner owner = identities.lockOwner(tenantId(), identity.type(), identity.hash());
            boolean sameCandidate = candidateId != null && Objects.equals(candidateId, owner.candidateId());
            boolean sameReferral = referralId != null && Objects.equals(referralId, owner.referralId())
                    && (owner.candidateId() == null || Objects.equals(candidateId, owner.candidateId()));
            if (!sameCandidate && !sameReferral) throw new IdentityConflict();
        }
    }

    private void requireTransaction() {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("招聘身份占位必须与业务写入处于同一事务");
    }

    public static final class IdentityConflict extends HrBusinessException {
        public IdentityConflict() { super("RECRUITMENT_IDENTITY_DUPLICATE", "该联系方式已有招聘记录，请核对后重试"); }
    }
}
