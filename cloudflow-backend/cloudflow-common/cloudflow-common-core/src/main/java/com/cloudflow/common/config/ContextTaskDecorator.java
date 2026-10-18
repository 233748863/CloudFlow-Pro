package com.cloudflow.common.config;

import com.cloudflow.common.core.context.TraceContext;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import org.slf4j.MDC;
import org.springframework.core.task.TaskDecorator;
import org.springframework.lang.NonNull;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class ContextTaskDecorator implements TaskDecorator {
    @Override
    @NonNull
    public Runnable decorate(@NonNull Runnable runnable) {
        Thread submittingThread = Thread.currentThread();
        Snapshot submitted = Snapshot.capture(false);
        submitted.mdc().putIfAbsent(TraceContext.MDC_KEY, TraceContext.normalize(null));
        return () -> {
            Snapshot caller = Thread.currentThread() == submittingThread ? Snapshot.capture(true) : null;
            clear();
            try {
                submitted.install();
                runnable.run();
            } finally {
                clear();
                if (caller != null) caller.install();
            }
        };
    }

    private static void clear() {
        RequestContextHolder.resetRequestAttributes();
        UserContext.clear();
        TenantContext.clear();
        MDC.clear();
    }

    private record Snapshot(Long userId, String userName, Set<String> roles, Long deptId, String deptName,
                            Long tenantId, Set<String> permissions, String authToken, Integer dsType,
                            List<Long> dsDeptIds, Long contextTenantId, boolean tenantSkip,
                            RequestAttributes requestAttributes, Map<String, String> mdc) {
        static Snapshot capture(boolean includeRequest) {
            Map<String, String> context = MDC.getCopyOfContextMap();
            Set<String> roles = UserContext.getRoles();
            return new Snapshot(UserContext.getUserId(), UserContext.getUserName(), roles == null ? Set.of() : Set.copyOf(roles),
                    UserContext.getDeptId(), UserContext.getDeptName(), UserContext.getTenantId(),
                    Set.copyOf(UserContext.getPermissions()), UserContext.getAuthToken(), UserContext.getDsType(),
                    List.copyOf(UserContext.getDsDeptIds()), TenantContext.getTenantId(), TenantContext.getTenantSkip(),
                    includeRequest ? RequestContextHolder.getRequestAttributes() : null, context == null ? new HashMap<>() : new HashMap<>(context));
        }

        void install() {
            UserContext.setUserId(userId);
            UserContext.setUserName(userName);
            UserContext.setRoles(roles);
            UserContext.setDeptId(deptId);
            UserContext.setDeptName(deptName);
            UserContext.setTenantId(tenantId);
            UserContext.setPermissions(permissions);
            UserContext.setAuthToken(authToken);
            UserContext.setDsType(dsType);
            UserContext.setDsDeptIds(dsDeptIds);
            TenantContext.setTenantId(contextTenantId);
            if (tenantSkip) TenantContext.setTenantSkip();
            if (requestAttributes != null) RequestContextHolder.setRequestAttributes(requestAttributes);
            MDC.setContextMap(mdc);
        }
    }
}
