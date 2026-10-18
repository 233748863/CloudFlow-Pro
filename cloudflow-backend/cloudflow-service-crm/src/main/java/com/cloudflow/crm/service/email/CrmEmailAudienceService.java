package com.cloudflow.crm.service.email;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.crm.domain.CrmCampaignTargetList;
import com.cloudflow.crm.domain.CrmTargetList;
import com.cloudflow.crm.domain.CrmTargetListMember;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmCampaignTargetListMapper;
import com.cloudflow.crm.mapper.CrmEmailSuppressionMapper;
import com.cloudflow.crm.mapper.CrmTargetListMapper;
import com.cloudflow.crm.service.impl.CrmAudienceService;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import com.cloudflow.crm.service.impl.CrmTargetListService;
import com.fasterxml.jackson.annotation.JsonIgnore;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class CrmEmailAudienceService {
    private final CrmCampaignTargetListMapper relations;
    private final CrmTargetListMapper lists;
    private final CrmTargetListService members;
    private final CrmAudienceService candidates;
    private final CrmEmailSuppressionMapper suppressions;

    public record Audience(@JsonIgnore List<CrmTargetListMember> recipients, Map<String, Integer> counts,
            @JsonIgnore Map<String, Map<String, String>> variables) {
        public Audience { recipients = List.copyOf(recipients); counts = Map.copyOf(counts); variables = Map.copyOf(variables); }

        public Map<String, Object> view() {
            Map<String, Object> result = new LinkedHashMap<>(counts);
            result.put("members", recipients.stream().limit(100).map(CrmAudienceService::masked).toList());
            result.put("sampleLimit", 100);
            return result;
        }

        @Override public String toString() { return "Audience[recipientCount=" + recipients.size() + "]"; }
    }

    public Audience collect(Long campaignId, CrmEmailAccessService.Actor actor) {
        List<CrmAudienceService.Candidate> visible = candidates.candidates(actor.scope("dept_id", "owner_id"), actor.scope("dept_id", "owner_id"),
                actor.scope("scope_dept_id", "scope_owner_id"));
        Map<String, CrmTargetListMember> included = new LinkedHashMap<>();
        Map<String, CrmTargetListMember> excluded = new LinkedHashMap<>();
        for (CrmCampaignTargetList relation : relations.selectList(new LambdaQueryWrapper<CrmCampaignTargetList>()
                .eq(CrmCampaignTargetList::getCampaignId, campaignId).eq(CrmCampaignTargetList::getDeleted, 0)
                .orderByAsc(CrmCampaignTargetList::getListId))) {
            CrmTargetList list = lists.selectAccessible(relation.getListId(), actor.scope("scope_dept_id", "owner_id"));
            if (list == null) throw new CrmBusinessException("MAIL_AUDIENCE_FORBIDDEN: 活动关联名单不存在或已无权访问");
            if (!"ACTIVE".equals(list.getStatus())) continue;
            Map<String, CrmTargetListMember> destination = Integer.valueOf(1).equals(relation.getIsExcludingFlag()) ? excluded : included;
            members.currentMembers(list, visible).forEach(member -> destination.put(CrmAudienceService.key(member), member));
        }
        List<String> hashes = included.values().stream().filter(CrmAudienceService::validEmail)
                .map(member -> CrmEmailSecurity.emailHash(member.getEmail())).distinct().toList();
        Set<String> suppressed = new HashSet<>();
        for (int offset = 0; offset < hashes.size(); offset += 500) {
            suppressed.addAll(suppressions.selectHashes(CrmRecordSupport.tenantId(), hashes.subList(offset, Math.min(offset + 500, hashes.size()))));
        }
        Audience selection = select(included, excluded, visible.stream().map(CrmAudienceService.Candidate::member).toList(), suppressed);
        Map<String, Map<String, String>> variables = new LinkedHashMap<>();
        Set<String> selected = selection.recipients().stream().map(CrmAudienceService::key).collect(Collectors.toSet());
        for (CrmAudienceService.Candidate candidate : visible) {
            String key = CrmAudienceService.key(candidate.member());
            if (selected.contains(key)) variables.put(key, Map.of("contactName", text(candidate.contactName()), "companyName", text(candidate.companyName())));
        }
        return new Audience(selection.recipients(), selection.counts(), variables);
    }

    public static Audience select(Map<String, CrmTargetListMember> included, Map<String, CrmTargetListMember> excluded,
            List<CrmTargetListMember> visible, Set<String> suppressed) {
        Set<String> excludedEmails = excluded.values().stream().filter(CrmAudienceService::validEmail)
                .map(CrmAudienceService::email).collect(Collectors.toSet());
        Set<String> optedOutEmails = visible.stream().filter(member -> Integer.valueOf(1).equals(member.getOptedOutFlag()))
                .filter(CrmAudienceService::validEmail).map(CrmAudienceService::email).collect(Collectors.toSet());
        Set<String> seen = new HashSet<>();
        List<CrmTargetListMember> selected = new ArrayList<>();
        int excludedCount = 0; int optedOutCount = 0; int invalidCount = 0; int duplicateCount = 0;
        for (CrmTargetListMember member : included.values().stream().sorted(Comparator.comparing(CrmAudienceService::key)).toList()) {
            String address = CrmAudienceService.email(member);
            if (excluded.containsKey(CrmAudienceService.key(member)) || excludedEmails.contains(address)) { excludedCount++; continue; }
            if (Integer.valueOf(1).equals(member.getOptedOutFlag()) || optedOutEmails.contains(address)
                    || !address.isEmpty() && suppressed.contains(CrmEmailSecurity.emailHash(address))) { optedOutCount++; continue; }
            if (address.isEmpty()) { invalidCount++; continue; }
            if (!seen.add(address)) { duplicateCount++; continue; }
            selected.add(member);
        }
        return new Audience(selected, Map.of("includedCount", included.size(), "excludedCount", excludedCount,
                "optedOutCount", optedOutCount, "invalidEmailCount", invalidCount, "duplicateCount", duplicateCount,
                "recipientCount", selected.size()), Map.of());
    }

    private String text(String value) { return value == null ? "" : value; }
}
