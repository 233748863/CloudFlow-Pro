package com.cloudflow.auth.im;

import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.mapper.ImCallbackMapper;
import com.cloudflow.auth.service.ISysUserBlacklistService;
import com.cloudflow.auth.service.LoginLockService;
import com.cloudflow.common.core.permission.PermissionIntersection;
import com.cloudflow.common.core.permission.TenantPermissionPolicy;
import com.cloudflow.common.security.im.ImTaskTodos;
import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ImTodoAccounts {
    private final ImDatabase database;
    private final ImCallbackMapper todos;
    private final ImConfigRules rules;
    private final TenantPermissionPolicy permissions;
    private final ISysUserBlacklistService blacklist;
    private final LoginLockService locks;

    public ImTaskTodos.Actor verify(ImTaskTodos.Request request) {
        rules.requireDeployment();
        if (request == null) throw ImFailure.callbackStale();
        return database.read(request.tenantId(), mapper -> {
            ImTodoRow todo = todos.todo(request.tenantId(), request.mappingId());
            if (todo == null || !Objects.equals(todo.getTenantId(), request.tenantId()) || !Objects.equals(todo.getMappingId(), request.mappingId())
                    || todo.getConfigId() == null || todo.getReceiverUserId() == null || !"WECOM".equals(todo.getImType())
                    || !Set.of("PENDING", "SENT", "UNKNOWN").contains(Objects.toString(todo.getStatus(), ""))
                    || !ImMessageContent.member(todo.getImUserId()) || todo.getVersion() == null || todo.getAssignmentVersion() == null) throw ImFailure.callbackStale();
            SysTenant tenant = mapper.tenant(request.tenantId());
            ImConfigRow config = mapper.config(request.tenantId(), todo.getConfigId());
            if (tenant == null || !Objects.equals(tenant.getTenantId(), request.tenantId()) || !"0".equals(tenant.getStatus())
                    || !Integer.valueOf(0).equals(tenant.getDeleted()) || tenant.getVersion() == null
                    || tenant.getExpireTime() != null && !tenant.getExpireTime().isAfter(LocalDateTime.now())
                    || config == null || !Objects.equals(config.getTenantId(), request.tenantId()) || !Objects.equals(config.getConfigId(), todo.getConfigId())
                    || !"WECOM".equals(config.getImType()) || !"ENABLED".equals(config.getStatus()) || !Integer.valueOf(0).equals(config.getDeleted())
                    || !Boolean.TRUE.equals(config.getTodoEnabled()) || config.getVersion() == null
                    || rules.expectedCallbackUrl(config.getConfigId()) == null
                    || !rules.expectedCallbackUrl(config.getConfigId()).equals(config.getCallbackUrl())) throw ImFailure.callbackActor();
            rules.credentials(config).requireCallbackKeys();
            List<ImLoginAccounts.Binding> bindings = mapper.loginBindings(request.tenantId(), config.getConfigId(), todo.getImUserId());
            if (bindings.size() != 1) throw ImFailure.callbackActor();
            ImLoginAccounts.Binding binding = bindings.get(0);
            if (binding.tenantId() != request.tenantId() || binding.configId() != config.getConfigId() || binding.userId() != todo.getReceiverUserId()
                    || !todo.getImUserId().equals(binding.externalUserId()) || binding.version() < 0 || binding.version() == Integer.MAX_VALUE
                    || !Set.of("ACTIVE", "OUT_OF_SCOPE").contains(Objects.toString(binding.status(), ""))) throw ImFailure.callbackActor();
            SysUser user = mapper.loginUser(request.tenantId(), binding.userId());
            if (user == null || !Objects.equals(user.getTenantId(), request.tenantId()) || !Objects.equals(user.getUserId(), binding.userId())
                    || !"0".equals(user.getStatus()) || !Integer.valueOf(0).equals(user.getDeleted()) || "1".equals(user.getPwdResetRequired())
                    || user.getUserName() == null || user.getUserName().isBlank() || user.getVersion() == null || user.getVersion() < 0
                    || user.getVersion() == Integer.MAX_VALUE || blacklist.isBanned(user.getUserId())
                    || locks.isLocked(user.getUserName(), request.tenantId())) throw ImFailure.callbackActor();
            Set<String> granted = new LinkedHashSet<>();
            for (String group : mapper.permissions(request.tenantId(), user.getUserId())) {
                for (String permission : group.split(",")) if (!permission.isBlank()) granted.add(permission.trim());
            }
            TenantPermissionPolicy.Entitlement entitlement = permissions.current(request.tenantId());
            Set<String> effective = PermissionIntersection.retain(granted, entitlement.restricted() ? entitlement.permissions() : null);
            if (!effective.containsAll(Set.of("workflow:task:todo", "workflow:process:view"))
                    || !Objects.equals(tenant.getVersion(), entitlement.tenantVersion())) throw ImFailure.callbackActor();
            return new ImTaskTodos.Actor(request, todo.getVersion(), config.getConfigId(), config.getVersion(), todo.getTaskId(),
                    todo.getAssignmentVersion(), binding.mappingId(), binding.version(), user.getUserId(), user.getVersion(), tenant.getVersion(), effective);
        });
    }
}
