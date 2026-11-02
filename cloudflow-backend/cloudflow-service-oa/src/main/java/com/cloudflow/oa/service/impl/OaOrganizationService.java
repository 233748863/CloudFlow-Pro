package com.cloudflow.oa.service.impl;

import com.cloudflow.oa.domain.vo.OaIdentityReference;
import com.cloudflow.oa.mapper.OaIdentityReferenceMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.util.HashSet;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class OaOrganizationService {
    private final OaIdentityReferenceMapper identities;

    public OaIdentityReference manager(Long userId) {
        Long tenantId = OaRecordSupport.tenantId();
        OaIdentityReference person = identities.user(userId, tenantId);
        if (person == null) return null;
        Long departmentId = person.getDeptId(); Set<Long> seen = new HashSet<>();
        while (departmentId != null && departmentId > 0 && seen.add(departmentId)) {
            OaIdentityReference department = identities.department(departmentId, tenantId);
            if (department == null) return null;
            Long leaderUserId = department.getLeaderUserId();
            if (leaderUserId != null && !leaderUserId.equals(userId)) {
                OaIdentityReference manager = identities.user(leaderUserId, tenantId);
                if (manager != null) return manager;
            }
            departmentId = department.getParentId();
        }
        return null;
    }
}
