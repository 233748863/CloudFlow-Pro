package com.cloudflow.common.audit;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.exception.ErrorCodeConstants;
import com.cloudflow.common.core.exception.ServiceException;
import org.springframework.aop.support.AopUtils;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.context.ApplicationContext;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 高敏实体 diff 审计启动期校验器。
 */
public class SensitiveDiffAuditVerifier implements SmartInitializingSingleton {

    private static final Map<String, String[]> REQUIRED_METHODS = Map.of(
            "com.cloudflow.auth.service.impl.SysUserServiceImpl", new String[]{"updateUser"},
            "com.cloudflow.auth.service.impl.SysRoleServiceImpl", new String[]{"updateRole"},
            "com.cloudflow.auth.service.impl.SysMenuServiceImpl", new String[]{"updateMenu"},
            "com.cloudflow.auth.service.impl.SysDictTypeServiceImpl", new String[]{"updateDictType", "updateDictData"}
    );

    private final ApplicationContext applicationContext;

    public SensitiveDiffAuditVerifier(ApplicationContext applicationContext) {
        this.applicationContext = applicationContext;
    }

    @Override
    public void afterSingletonsInstantiated() {
        Map<String, Object> beans = applicationContext.getBeansOfType(Object.class);
        List<String> violations = new ArrayList<>();

        for (Object bean : beans.values()) {
            Class<?> targetClass = AopUtils.getTargetClass(bean);
            if (targetClass == null) {
                continue;
            }
            String[] methodNames = REQUIRED_METHODS.get(targetClass.getName());
            if (methodNames == null) {
                continue;
            }
            for (String methodName : methodNames) {
                Method method = findMethod(targetClass, methodName);
                if (method == null) {
                    violations.add(targetClass.getName() + "#" + methodName + " (missing)");
                    continue;
                }
                Audit audit = method.getAnnotation(Audit.class);
                if (audit == null || !audit.diff()) {
                    violations.add(targetClass.getName() + "#" + methodName);
                }
            }
        }

        if (!violations.isEmpty()) {
            throw new ServiceException("高敏更新方法缺少 @Audit(diff=true): " + String.join(", ", violations),
                    ErrorCodeConstants.AUDIT_CONFIGURATION_ERROR);
        }
    }

    private Method findMethod(Class<?> targetClass, String methodName) {
        for (Method method : targetClass.getDeclaredMethods()) {
            if (method.getName().equals(methodName)) {
                return method;
            }
        }
        return null;
    }
}
