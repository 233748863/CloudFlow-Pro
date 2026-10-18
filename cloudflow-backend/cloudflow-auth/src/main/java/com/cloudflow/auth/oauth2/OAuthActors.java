package com.cloudflow.auth.oauth2;

import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.auth.domain.SysDept;
import com.cloudflow.auth.domain.SysRole;
import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.mapper.OAuthMapper;
import com.cloudflow.common.security.core.TokenService;
import com.cloudflow.common.security.service.CurrentPermissionService;
import com.cloudflow.common.security.oauth2.OAuthFailure;
import com.cloudflow.common.security.oauth2.OAuthScope;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class OAuthActors {
    private final OAuthDatabase database;
    private final OAuthProperties properties;
    private final TokenService tokens;
    private final CurrentPermissionService currentPermissions;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.cloudflow.common.core.permission.LoginSessionPolicy loginSessionPolicy;

    public Actor current(String permission) {
        String token = tokens.getCurrentTokenValue();
        Map<String, Object> login = tokens.getLoginUserByToken(token);
        if (token == null || token.isBlank() || login == null) throw OAuthFailure.unauthenticated();
        Long userId = number(login.get("userId"));
        Long tenantId = number(login.get("tenantId"));
        Object authenticated = StpUtil.getStpLogic().getLoginIdByToken(token);
        if (userId == null || tenantId == null || !userId.toString().equals(String.valueOf(authenticated))) throw OAuthFailure.unauthenticated();
        Actor actor = database.read(mapper -> load(mapper, tenantId, userId, mapper.user(tenantId, userId), true));
        if (!actor.permissions().contains(permission)) throw OAuthFailure.forbidden();
        return new Actor(actor.user(), actor.tenant(), actor.roles(), actor.permissions(), actor.dsType(), actor.deptIds(), token);
    }

    public Actor load(OAuthMapper mapper, Long tenantId, Long userId) {
        return load(mapper, tenantId, userId, mapper.user(tenantId, userId), false);
    }

    public Actor lockCurrent(OAuthMapper mapper, Actor actor) {
        Long tenantId = actor.user().getTenantId();
        Long userId = actor.user().getUserId();
        SysUser user = mapper.lockUser(tenantId, userId);
        Map<String, Object> login = tokens.getLoginUserByToken(actor.internalToken());
        Object authenticated = StpUtil.getStpLogic().getLoginIdByToken(actor.internalToken());
        if (login == null || !Objects.equals(tenantId, number(login.get("tenantId")))
                || !Objects.equals(userId, number(login.get("userId"))) || !userId.toString().equals(String.valueOf(authenticated))) {
            throw OAuthFailure.unauthenticated();
        }
        return load(mapper, tenantId, userId, user, true);
    }

    private Actor load(OAuthMapper mapper, Long tenantId, Long userId, SysUser user, boolean internal) {
        SysTenant tenant = mapper.tenant(tenantId);
        if (tenant == null || !Integer.valueOf(0).equals(tenant.getDeleted()) || !"0".equals(tenant.getStatus())
                || tenant.getExpireTime() != null && !tenant.getExpireTime().isAfter(LocalDateTime.now())
                || user == null || !Objects.equals(tenantId, user.getTenantId()) || !"0".equals(user.getStatus())
                || !Integer.valueOf(0).equals(user.getDeleted()) || "1".equals(user.getPwdResetRequired())) throw OAuthFailure.unauthenticated();
        if (loginSessionPolicy != null && (user.getVersion() == null
                || !loginSessionPolicy.accepts(tenantId, tenantId, userId, user.getVersion()))) throw OAuthFailure.unauthenticated();
        List<SysRole> roles = mapper.roles(tenantId, userId);
        Set<String> permissions = new LinkedHashSet<>();
        for (String value : mapper.permissions(tenantId, userId)) {
            for (String permission : value.split(",")) if (!permission.isBlank()) permissions.add(permission.trim());
        }
        int dsType = roles.stream().map(SysRole::getDsType).filter(Objects::nonNull).min(Integer::compareTo).orElse(4);
        if (dsType < 0 || dsType > 4) throw OAuthFailure.forbidden();
        Set<Long> departments = new LinkedHashSet<>();
        if (dsType == 1) {
            for (SysRole role : roles) {
                if (!Integer.valueOf(1).equals(role.getDsType()) || role.getDsScope() == null) continue;
                for (String item : role.getDsScope().split(",")) {
                    Long department = number(item.trim());
                    if (department == null) throw OAuthFailure.forbidden();
                    departments.add(department);
                }
            }
        } else if ((dsType == 2 || dsType == 3) && user.getDeptId() != null) {
            departments.add(user.getDeptId());
            if (dsType == 2) {
                for (SysDept department : mapper.departments(tenantId)) {
                    String ancestors = department.getAncestors();
                    if (ancestors != null && Arrays.asList(ancestors.split(",")).contains(user.getDeptId().toString())) departments.add(department.getDeptId());
                }
            }
        }
        Set<String> effective = internal ? currentPermissions.internalPermissions(userId, tenantId, permissions)
                : currentPermissions.permissions(tenantId, permissions);
        return new Actor(user, tenant, List.copyOf(roles), effective, dsType, List.copyOf(departments), null);
    }

    public void requireScopes(Actor actor, List<String> scopes, boolean serviceAccount) {
        for (String code : scopes) {
            OAuthScope scope = OAuthScope.require(code);
            if (serviceAccount && scope == OAuthScope.PROFILE || !actor.permissions().containsAll(scope.businessPermissions())) {
                throw OAuthFailure.forbidden();
            }
        }
    }

    public void serviceAccount(Actor actor) {
        Set<Long> allowed = properties.getServiceUserIds();
        Set<String> accepted = Set.of("crm:customer:list", "workflow:process:view", "system:auth:info", "system:auth:logout");
        if (allowed == null || !allowed.contains(actor.user().getUserId())
                || actor.roles().stream().anyMatch(role -> "admin".equalsIgnoreCase(role.getRoleKey()) || "administrator".equalsIgnoreCase(role.getRoleKey()))
                || actor.permissions().stream().anyMatch(permission -> !accepted.contains(permission))) {
            throw OAuthFailure.invalid("客户端凭据模式须使用部署名单中的专用只读服务账号");
        }
    }

    private static Long number(Object value) {
        if (value == null || !String.valueOf(value).matches("[1-9][0-9]{0,18}")) return null;
        try { return Long.valueOf(String.valueOf(value)); }
        catch (NumberFormatException invalid) { return null; }
    }

    public record Actor(SysUser user, SysTenant tenant, List<SysRole> roles, Set<String> permissions,
            int dsType, List<Long> deptIds, String internalToken) {
        @Override
        public String toString() { return "OAuthActor[userId=" + user.getUserId() + "]"; }
    }
}
