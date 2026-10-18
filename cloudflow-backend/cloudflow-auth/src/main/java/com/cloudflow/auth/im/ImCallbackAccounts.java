package com.cloudflow.auth.im;

import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.mapper.ImCallbackMapper;
import com.cloudflow.auth.service.ISysUserBlacklistService;
import com.cloudflow.auth.service.LoginLockService;
import com.cloudflow.common.core.permission.TenantPermissionPolicy;
import com.cloudflow.common.core.permission.PermissionIntersection;
import com.cloudflow.common.security.im.ImTaskCallbacks;
import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ImCallbackAccounts {
    private final ImDatabase database;
    private final ImCallbackMapper mapper;
    private final ImConfigRules rules;
    private final TenantPermissionPolicy permissions;
    private final ISysUserBlacklistService blacklist;
    private final LoginLockService locks;

    public ImTaskCallbacks.Actor require(ImCallbackRow claim) {
        rules.requireDeployment();
        if (claim == null || claim.getTenantId() == null || claim.getTenantId() <= 0 || claim.getCallbackId() == null
                || claim.getCallbackId() <= 0 || claim.getClaimUntil() == null) throw ImFailure.callbackStale();
        return database.read(claim.getTenantId(), scoped -> {
            ImCallbackRow event = mapper.claimed(claim.getTenantId(), claim.getCallbackId());
            if (event == null || !Objects.equals(event.getTenantId(), claim.getTenantId()) || !Objects.equals(event.getCallbackId(), claim.getCallbackId())
                    || !"PROCESSING".equals(event.getStatus()) || !Objects.equals(event.getClaimUntil(), claim.getClaimUntil())
                    || !event.getClaimUntil().isAfter(LocalDateTime.now()) || event.getTaskMappingId() == null
                    || event.getActionType() == null || !Set.of("APPROVE", "REJECT").contains(event.getActionType())) throw ImFailure.callbackStale();
            ImTodoRow todo = mapper.todo(event.getTenantId(), event.getTaskMappingId());
            if (todo == null || !Objects.equals(todo.getTenantId(), event.getTenantId()) || !Objects.equals(todo.getConfigId(), event.getConfigId())
                    || !Objects.equals(todo.getMappingId(), event.getTaskMappingId()) || !"WECOM".equals(todo.getImType())
                    || todo.getTaskId() == null || !todo.getTaskId().matches("[A-Za-z0-9_-]{1,64}") || todo.getAssignmentVersion() == null
                    || todo.getAssignmentVersion() < 0 || todo.getVersion() == null || todo.getVersion() < 0
                    || todo.getReceiverUserId() == null || todo.getReceiverUserId() <= 0) throw ImFailure.callbackStale();
            if ("PENDING".equals(todo.getStatus())) throw ImFailure.callbackUnavailable();
            if (!Set.of("SENT", "UNKNOWN").contains(Objects.toString(todo.getStatus(), ""))) throw ImFailure.callbackStale();
            if (!ImMessageContent.member(event.getImUserId()) || !event.getImUserId().equals(todo.getImUserId())) throw ImFailure.callbackActor();
            SysTenant tenant = scoped.tenant(event.getTenantId());
            ImConfigRow config = scoped.config(event.getTenantId(), event.getConfigId());
            if (tenant == null || !"0".equals(tenant.getStatus()) || !Integer.valueOf(0).equals(tenant.getDeleted())
                    || tenant.getExpireTime() != null && !tenant.getExpireTime().isAfter(LocalDateTime.now())
                    || config == null || !Objects.equals(config.getTenantId(), event.getTenantId()) || !"WECOM".equals(config.getImType())
                    || !"ENABLED".equals(config.getStatus()) || !Integer.valueOf(0).equals(config.getDeleted()) || !Boolean.TRUE.equals(config.getTodoEnabled())
                    || rules.expectedCallbackUrl(config.getConfigId()) == null || !rules.expectedCallbackUrl(config.getConfigId()).equals(config.getCallbackUrl())) throw ImFailure.callbackActor();
            rules.credentials(config).requireCallbackKeys();
            List<ImLoginAccounts.Binding> bindings = scoped.loginBindings(event.getTenantId(), event.getConfigId(), event.getImUserId());
            if (bindings.size() != 1) throw ImFailure.callbackActor();
            ImLoginAccounts.Binding binding = bindings.get(0);
            if (binding.tenantId() != event.getTenantId() || binding.configId() != event.getConfigId() || binding.userId() != todo.getReceiverUserId()
                    || !event.getImUserId().equals(binding.externalUserId()) || binding.version() < 0 || binding.version() == Integer.MAX_VALUE
                    || !Set.of("ACTIVE", "OUT_OF_SCOPE").contains(Objects.toString(binding.status(), ""))) throw ImFailure.callbackActor();
            SysUser user = scoped.loginUser(event.getTenantId(), binding.userId());
            if (user == null || !Objects.equals(user.getUserId(), todo.getReceiverUserId()) || !Objects.equals(user.getTenantId(), event.getTenantId())
                    || !"0".equals(user.getStatus()) || !Integer.valueOf(0).equals(user.getDeleted()) || "1".equals(user.getPwdResetRequired())
                    || user.getVersion() == null || user.getVersion() < 0 || user.getVersion() == Integer.MAX_VALUE
                    || user.getUserName() == null || user.getUserName().isBlank() || blacklist.isBanned(user.getUserId())
                    || locks.isLocked(user.getUserName(), event.getTenantId())) throw ImFailure.callbackActor();
            Set<String> granted = new LinkedHashSet<>();
            for (String item : scoped.permissions(event.getTenantId(), user.getUserId())) {
                for (String permission : item.split(",")) if (!permission.isBlank()) granted.add(permission.trim());
            }
            TenantPermissionPolicy.Entitlement entitlement = permissions.current(event.getTenantId());
            if (!PermissionIntersection.retain(granted, entitlement.restricted() ? entitlement.permissions() : null).contains("workflow:task:complete")
                    || tenant.getVersion() == null || !Objects.equals(tenant.getVersion(), entitlement.tenantVersion())
                    || config.getVersion() == null || config.getVersion() < 0) throw ImFailure.callbackActor();
            return new ImTaskCallbacks.Actor(event.getTenantId(), event.getCallbackId(), event.getConfigId(), config.getVersion(), event.getClaimUntil(),
                    todo.getMappingId(), todo.getVersion(), todo.getTaskId(), todo.getAssignmentVersion(), binding.mappingId(), binding.version(),
                    user.getUserId(), user.getVersion(), event.getActionType(), tenant.getVersion(), entitlement.menuIds());
        });
    }

    public ImTaskCallbacks.Actor verify(ImTaskCallbacks.Request request) {
        if (request == null) throw ImFailure.callbackStale();
        ImCallbackRow claim = new ImCallbackRow();
        claim.setTenantId(request.tenantId()); claim.setCallbackId(request.callbackId()); claim.setClaimUntil(request.claimUntil());
        return require(claim);
    }
}
