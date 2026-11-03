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
        OaIdentityReference person = identities.user(userId, OaRecordSupport.tenantId());
        if (person == null) return null;
        Long departmentId = person.getDeptId(); Set<Long> seen = new HashSet<>();
        while (departmentId != null && departmentId > 0 && seen.add(departmentId)) {
            OaIdentityReference department = identities.department(departmentId, OaRecordSupport.tenantId());
            if (department == null) return null;
            if (department.getLeaderUserId() != null && !department.getLeaderUserId().equals(userId)) {
                OaIdentityReference manager = identities.user(department.getLeaderUserId(), OaRecordSupport.tenantId());
                if (manager != null) return manager;
            }
            departmentId = department.getParentId();
        }
        return null;
    }
}
