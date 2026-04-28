package com.cloudflow.common.config;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import org.springframework.core.task.TaskDecorator;
import org.springframework.lang.NonNull;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;

import java.util.List;
import java.util.Set;

/**
 * 异步任务装饰器
 * 用于将主线程的 UserContext 和 TenantContext 传递给 @Async 线程
 * 
 * 注意：由于 UserContext 和 TenantContext 已升级为 TransmittableThreadLocal，
 * 如果使用 TtlExecutors.getTtlExecutorService() 包装线程池，则上下文会自动传递，
 * 此装饰器作为兜底方案，确保在未使用 TTL 包装的线程池中也能正确传递上下文。
 * 
 * @author CloudFlow
 */
public class ContextTaskDecorator implements TaskDecorator {

    @Override
    @NonNull
    public Runnable decorate(@NonNull Runnable runnable) {
        // 1. 捕获主线程的上下文
        Long userId = UserContext.getUserId();
        String userName = UserContext.getUserName();
        Set<String> roles = UserContext.getRoles();
        Long deptId = UserContext.getDeptId();
        String deptName = UserContext.getDeptName();
        Long tenantId = UserContext.getTenantId();
        Set<String> permissions = UserContext.getPermissions();
        String authToken = UserContext.getAuthToken();
        Integer dsType = UserContext.getDsType();
        List<Long> dsDeptIds = UserContext.getDsDeptIds();
        Long tenantContextId = TenantContext.getTenantId();
        RequestAttributes requestAttributes = RequestContextHolder.getRequestAttributes();

        return () -> {
            try {
                // 2. 在子线程中恢复上下文
                if (userId != null) UserContext.setUserId(userId);
                if (userName != null) UserContext.setUserName(userName);
                if (roles != null) UserContext.setRoles(roles);
                if (deptId != null) UserContext.setDeptId(deptId);
                if (deptName != null) UserContext.setDeptName(deptName);
                if (tenantId != null) UserContext.setTenantId(tenantId);
                if (permissions != null && !permissions.isEmpty()) UserContext.setPermissions(permissions);
                if (authToken != null) UserContext.setAuthToken(authToken);
                if (dsType != null) UserContext.setDsType(dsType);
                if (dsDeptIds != null && !dsDeptIds.isEmpty()) UserContext.setDsDeptIds(dsDeptIds);
                if (tenantContextId != null) TenantContext.setTenantId(tenantContextId);
                if (requestAttributes != null) {
                    // 异步线程也保留请求上下文，便于下游读取真实 IP / User-Agent。
                    RequestContextHolder.setRequestAttributes(requestAttributes, true);
                }

                // 3. 执行任务
                runnable.run();
            } finally {
                // 4. 清理子线程上下文
                RequestContextHolder.resetRequestAttributes();
                UserContext.clear();
                TenantContext.clear();
            }
        };
    }
}
