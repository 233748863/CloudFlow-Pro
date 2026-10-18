package com.cloudflow.common.excel.importing;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.security.core.TokenService;
import java.util.Collection;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

public class ImportIdentity {
    private final TokenService tokens;

    public ImportIdentity(TokenService tokens) {
        this.tokens = tokens;
    }

    public record Operator(long tenantId, long userId, String name) { }

    public Operator require() {
        String token = UserContext.getAuthToken();
        Map<String, Object> session = token == null ? null : tokens.verifyToken(token);
        if (session == null || UserContext.getUserId() == null || UserContext.getTenantId() == null
                || !Objects.equals(String.valueOf(UserContext.getUserId()), String.valueOf(session.get("userId")))
                || !Objects.equals(String.valueOf(UserContext.getTenantId()), String.valueOf(session.get("tenantId")))) {
            throw new ServiceException("导入需要有效登录身份，请重新登录后重试", 403);
        }
        UserContext.setPermissions(strings(session.get("permissions")));
        UserContext.setRoles(strings(session.get("roles")));
        String name = Objects.toString(session.get("username"), String.valueOf(UserContext.getUserId()));
        UserContext.setUserName(name);
        return new Operator(UserContext.getTenantId(), UserContext.getUserId(), name);
    }

    public Operator require(String permission) {
        Operator operator = require();
        if (!ImportRegistry.hasPermission(permission)) throw new ServiceException("无权执行该导入操作", 403);
        return operator;
    }

    private Set<String> strings(Object value) {
        return value instanceof Collection<?> entries ? entries.stream().filter(Objects::nonNull)
                .map(String::valueOf).collect(Collectors.toUnmodifiableSet()) : Set.of();
    }
}
