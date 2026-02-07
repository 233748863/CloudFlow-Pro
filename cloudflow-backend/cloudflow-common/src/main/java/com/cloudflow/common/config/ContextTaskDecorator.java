package com.cloudflow.common.config;

import com.cloudflow.common.core.context.UserContext;
import org.springframework.core.task.TaskDecorator;
import org.springframework.lang.NonNull;
import java.util.Set;

/**
 * 异步任务装饰器
 * 用于将主线程的 UserContext 传递给 @Async 线程
 */
public class ContextTaskDecorator implements TaskDecorator {

    @Override
    @NonNull
    public Runnable decorate(@NonNull Runnable runnable) {
        // 1. 获取主线程的上下文
        Long userId = UserContext.getUserId();
        String userName = UserContext.getUserName();
        Set<String> roles = UserContext.getRoles();
        Long deptId = UserContext.getDeptId();
        Long tenantId = UserContext.getTenantId();

        return () -> {
            try {
                // 2. 在子线程中设置上下文
                if (userId != null) UserContext.setUserId(userId);
                if (userName != null) UserContext.setUserName(userName);
                if (roles != null) UserContext.setRoles(roles);
                if (deptId != null) UserContext.setDeptId(deptId);
                if (tenantId != null) UserContext.setTenantId(tenantId);
                
                // 3. 执行任务
                runnable.run();
            } finally {
                // 4. 清理子线程上下文
                UserContext.clear();
            }
        };
    }
}
