package com.cloudflow.crm.service.impl;

import com.cloudflow.crm.exception.CrmBusinessException;

import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.crm.service.email.CrmEmailSecurity;
import com.cloudflow.crm.domain.*;
import com.cloudflow.crm.domain.dto.CrmAudienceCondition;
import com.cloudflow.crm.mapper.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class CrmAudienceService {
    private final CrmCustomerMapper customers;
    private final CrmLeadMapper leads;
    private final CrmContactMapper contacts;
    private final CrmTerritoryService territories;

    public record Candidate(CrmTargetListMember member, Long territoryId, String industry, String segment, String level, Integer score,
            String contactName, String companyName) {
        public Candidate(CrmTargetListMember member, Long territoryId, String industry, String segment, String level, Integer score) {
            this(member, territoryId, industry, segment, level, score, member.getMemberName(), "");
        }
        @Override public String toString() { return "Candidate[type=" + member.getMemberType() + ",id=" + member.getMemberRefId() + "]"; }
    }

    public List<Candidate> candidates() {
        return candidates(DataScopeUtils.listScope("dept_id", "owner_id"), DataScopeUtils.listScope("dept_id", "owner_id"),
                DataScopeUtils.listScope("scope_dept_id", "scope_owner_id"));
    }

    public List<Candidate> candidates(DataScope customerScope, DataScope leadScope, DataScope contactScope) {
        List<CrmCustomer> customerRows = customers.selectAllByDataScope(customerScope);
        Map<Long, CrmCustomer> customerIndex = customerRows.stream().collect(Collectors.toMap(CrmCustomer::getCustomerId, Function.identity()));
        List<Candidate> result = new ArrayList<>();
        for (CrmCustomer customer : customerRows) result.add(new Candidate(member("CUSTOMER", customer.getCustomerId(), customer.getCustomerName(), customer.getEmail(), customer.getPhone(), customer.getUnsubscribeFlag()),
                customer.getTerritoryId(), customer.getIndustry(), customer.getMarketSegment(), customer.getLevelCode(), null,
                customer.getCustomerName(), customer.getCustomerName()));
        for (CrmLead lead : leads.selectAllByDataScope(leadScope)) {
            result.add(new Candidate(member("LEAD", lead.getLeadId(), lead.getLeadName(), lead.getEmail(), lead.getMobile(), lead.getUnsubscribeFlag()),
                    lead.getTerritoryId(), lead.getIndustry(), lead.getMarketSegment(), null, lead.getLeadScore(), lead.getContactName(), lead.getCompanyName()));
        }
        for (CrmContact contact : contacts.selectAllByDataScope(contactScope)) {
            CrmCustomer customer = customerIndex.get(contact.getCustomerId());
            if (customer != null) result.add(new Candidate(member("CONTACT", contact.getContactId(), contact.getContactName(), contact.getEmail(), contact.getMobile(), customer.getUnsubscribeFlag()),
                    customer.getTerritoryId(), customer.getIndustry(), customer.getMarketSegment(), customer.getLevelCode(), null,
                    contact.getContactName(), customer.getCustomerName()));
        }
        return result;
    }

    public List<CrmTargetListMember> query(CrmAudienceCondition condition, List<Candidate> candidates) {
        validate(condition);
        Set<Long> territoryIds = condition.getTerritoryId() == null ? null : territories.list(condition.getTerritoryId()).stream().map(CrmTerritory::getTerritoryId).collect(Collectors.toSet());
        return candidates.stream().filter(candidate -> condition.getMemberType().equals(candidate.member().getMemberType()))
                .filter(candidate -> territoryIds == null || territoryIds.contains(candidate.territoryId()))
                .filter(candidate -> matches(condition.getIndustry(), candidate.industry()) && matches(condition.getMarketSegment(), candidate.segment()) && matches(condition.getLevelCode(), candidate.level()))
                .filter(candidate -> condition.getScoreMin() == null || candidate.score() != null && candidate.score() >= condition.getScoreMin())
                .filter(candidate -> condition.getScoreMax() == null || candidate.score() != null && candidate.score() <= condition.getScoreMax())
                .map(Candidate::member).toList();
    }

    public static void validate(CrmAudienceCondition condition) {
        CrmRecordSupport.require(condition, "请选择名单条件");
        condition.setMemberType(CrmRecordSupport.code(condition.getMemberType(), "CUSTOMER", Set.of("CUSTOMER", "CONTACT", "LEAD"), "成员类型"));
        if (condition.getScoreMin() != null && condition.getScoreMax() != null && condition.getScoreMax() < condition.getScoreMin()) throw new CrmBusinessException("评分上限不能小于下限");
        if (!"LEAD".equals(condition.getMemberType()) && (condition.getScoreMin() != null || condition.getScoreMax() != null)) throw new CrmBusinessException("评分筛选仅适用于线索");
    }

    public Map<String, CrmTargetListMember> index(List<Candidate> candidates) {
        return candidates.stream().map(Candidate::member).collect(Collectors.toMap(CrmAudienceService::key, Function.identity(), (first, second) -> first, LinkedHashMap::new));
    }

    public static String key(CrmTargetListMember member) { return member.getMemberType() + ":" + member.getMemberRefId(); }
    public static String email(CrmTargetListMember member) {
        try { return CrmEmailSecurity.address(member.getEmail()); }
        catch (IllegalArgumentException invalid) { return ""; }
    }
    public static boolean validEmail(CrmTargetListMember member) { return !email(member).isEmpty(); }
    private boolean matches(String expected, String actual) { return expected == null || expected.isBlank() || Objects.equals(expected, actual); }

    public static CrmTargetListMember masked(CrmTargetListMember member) {
        CrmTargetListMember copy = member(member.getMemberType(), member.getMemberRefId(), member.getMemberName(), member.getEmail(), member.getPhone(), member.getOptedOutFlag());
        String email = email(copy);
        copy.setEmail(email.isEmpty() ? null : CrmEmailSecurity.maskAddress(email));
        String phone = copy.getPhone();
        copy.setPhone(phone == null || phone.isBlank() ? null : phone.length() > 7 ? phone.substring(0, 3) + "****" + phone.substring(phone.length() - 4) : "***");
        return copy;
    }

    private static CrmTargetListMember member(String type, Long id, String name, String email, String phone, Integer optedOut) {
        CrmTargetListMember member = new CrmTargetListMember(); member.setMemberType(type); member.setMemberRefId(id); member.setMemberName(name);
        member.setEmail(email); member.setPhone(phone); member.setOptedOutFlag(Integer.valueOf(1).equals(optedOut) ? 1 : 0); return member;
    }
}
