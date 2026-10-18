package com.cloudflow.auth.im;

import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.mapper.ImMapper;
import com.cloudflow.common.security.core.TokenService;
import com.cloudflow.common.core.permission.TenantPermissionPolicy;
import com.fasterxml.jackson.annotation.JsonIgnore;
import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ImActors {
    private static final Set<String> SELF_PERMISSIONS = Set.of("system:im:binding:mine", "system:im:binding:bind", "system:im:binding:unbind");
    private final TokenService tokens;
    private final TenantPermissionPolicy permissions;
    private final ImDatabase database;

    public Actor management(String permission) {
        String token = tokens.getCurrentTokenValue();
        Actor actor = tokenActor(token);
        database.read(actor.tenantId(), mapper -> { verify(mapper, actor, permission, false); return null; });
        return actor;
    }

    public Actor self(String permission) {
        Actor actor = tokenActor(tokens.getCurrentTokenValue());
        database.read(actor.tenantId(), mapper -> { verifySelf(mapper, actor, permission, false); return null; });
        return actor;
    }

    public void verifySelf(ImMapper mapper, Actor actor, String permission, boolean locked) {
        if (permission == null || !SELF_PERMISSIONS.contains(permission) || actor == null) throw ImFailure.forbidden();
        Actor current = tokenActor(actor.token());
        if (current.tenantId() != actor.tenantId() || current.userId() != actor.userId()) throw ImFailure.unauthenticated();
        verifyRecorded(mapper, actor, permission, locked, false);
    }

    public void verify(ImMapper mapper, Actor actor, String permission, boolean locked) {
        Actor current = tokenActor(actor.token());
        if (current.tenantId() != actor.tenantId() || current.userId() != actor.userId()) throw ImFailure.unauthenticated();
        verifyRecorded(mapper, actor, permission, locked);
    }

    void verifyRecorded(ImMapper mapper, Actor actor, String permission, boolean locked) {
        verifyRecorded(mapper, actor, permission, locked, true);
    }

    private void verifyRecorded(ImMapper mapper, Actor actor, String permission, boolean locked, boolean requireAdministrator) {
        if (actor == null || actor.tenantId() <= 0 || actor.userId() <= 0) throw ImFailure.unauthenticated();
        SysUser user = locked ? mapper.lockUser(actor.tenantId(), actor.userId()) : mapper.user(actor.tenantId(), actor.userId());
        SysTenant tenant = mapper.tenant(actor.tenantId());
        if (user == null || !Objects.equals(user.getTenantId(), actor.tenantId()) || !"0".equals(user.getStatus())
                || !Integer.valueOf(0).equals(user.getDeleted()) || "1".equals(user.getPwdResetRequired())
                || tenant == null || !"0".equals(tenant.getStatus()) || !Integer.valueOf(0).equals(tenant.getDeleted())
                || tenant.getExpireTime() != null && !tenant.getExpireTime().isAfter(LocalDateTime.now())) {
            throw ImFailure.unauthenticated();
        }
        Set<String> granted = new LinkedHashSet<>();
        for (String item : mapper.permissions(actor.tenantId(), actor.userId())) {
            for (String value : item.split(",")) if (!value.isBlank()) granted.add(value.trim());
        }
        if (requireAdministrator && mapper.administrator(actor.tenantId(), actor.userId()) < 1
                || !permissions.intersect(actor.tenantId(), granted).contains(permission)) throw ImFailure.forbidden();
    }

    private Actor tokenActor(String token) {
        if (token == null || token.isBlank()) throw ImFailure.unauthenticated();
        Map<String, Object> login = tokens.getLoginUserByToken(token);
        if (login == null) throw ImFailure.unauthenticated();
        long tenantId = identifier(login.get("tenantId"));
        long userId = identifier(login.get("userId"));
        Object authenticated = StpUtil.getStpLogic().getLoginIdByToken(token);
        if (!Long.toString(userId).equals(String.valueOf(authenticated))) throw ImFailure.unauthenticated();
        return new Actor(tenantId, userId, token);
    }

    private long identifier(Object value) {
        try {
            String text = String.valueOf(value);
            if (!text.matches("[1-9][0-9]{0,18}")) throw ImFailure.unauthenticated();
            return Long.parseLong(text);
        } catch (NumberFormatException failure) { throw ImFailure.unauthenticated(); }
    }

    public record Actor(long tenantId, long userId, @JsonIgnore String token) {
        @Override
        public String toString() { return "ImActor[tenantId=" + tenantId + ", userId=" + userId + "]"; }
    }
}
