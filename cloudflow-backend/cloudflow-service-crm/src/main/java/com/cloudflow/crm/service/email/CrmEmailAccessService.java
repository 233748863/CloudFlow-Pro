package com.cloudflow.crm.service.email;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.crm.domain.CrmCampaign;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmEmailAccessMapper;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class CrmEmailAccessService {
    private final CrmEmailAccessMapper mapper;

    @Data
    public static class Role {
        private Long userId;
        private String userName;
        private Long deptId;
        private String roleKey;
        private Integer dsType;
        private String dsScope;
        private Boolean sending;
        private Boolean assigning;
    }

    public record Actor(Long userId, String userName, boolean sending, boolean assigning, int scopeType, List<Long> departments) {
        public Actor { departments = List.copyOf(departments); }

        public DataScope scope(String departmentColumn, String ownerColumn) {
            DataScope scope = DataScopeUtils.listScope(departmentColumn, ownerColumn);
            if (scopeType == 0) scope.setSkip(true);
            else if (!departments.isEmpty() && departmentColumn != null) scope.setDeptList(departments);
            else scope.setUserId(userId);
            return scope;
        }

        public void assertSending(CrmCampaign campaign) {
            if (!sending || campaign == null || !Objects.equals(campaign.getOwnerId(), userId) && !assigning) {
                throw new CrmBusinessException("MAIL_FORBIDDEN: 无权操作该营销活动邮件");
            }
        }
    }

    public Actor current() { return resolve(UserContext.getUserId()); }

    public Actor resolve(Long userId) {
        if (userId == null || userId <= 0) throw new CrmBusinessException("MAIL_FORBIDDEN: 缺少邮件操作人");
        Long tenantId = CrmRecordSupport.tenantId();
        List<Role> roles = mapper.roles(tenantId, userId);
        if (roles.isEmpty()) throw new CrmBusinessException("MAIL_FORBIDDEN: 操作人、角色或租户已失效");
        boolean admin = roles.stream().anyMatch(role -> "admin".equals(role.getRoleKey()));
        boolean sending = admin || roles.stream().anyMatch(role -> Boolean.TRUE.equals(role.getSending()));
        boolean assigning = admin || roles.stream().anyMatch(role -> Boolean.TRUE.equals(role.getAssigning()));
        int scope = roles.stream().map(Role::getDsType).filter(Objects::nonNull).filter(value -> value >= 0 && value <= 4)
                .min(Integer::compareTo).orElse(4);
        Long deptId = roles.get(0).getDeptId();
        LinkedHashSet<Long> departments = new LinkedHashSet<>();
        if (scope == 1) {
            try {
                for (Role role : roles) {
                    if (role.getDsScope() == null || role.getDsScope().isBlank()) continue;
                    for (String value : role.getDsScope().split(",")) {
                        if (!value.trim().matches("[1-9][0-9]{0,18}")) throw new IllegalArgumentException();
                        departments.add(Long.valueOf(value.trim()));
                    }
                }
            } catch (IllegalArgumentException invalid) { throw new CrmBusinessException("MAIL_FORBIDDEN: 操作人数据范围无效"); }
        } else if (scope == 2 && deptId != null) departments.addAll(mapper.departmentTree(tenantId, deptId));
        else if (scope == 3 && deptId != null) departments.add(deptId);
        return new Actor(userId, roles.get(0).getUserName(), sending, assigning, scope, List.copyOf(departments));
    }
}
