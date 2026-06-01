package com.cloudflow.common.audit;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.exception.ErrorCodeConstants;
import com.cloudflow.common.core.exception.ServiceException;
import org.springframework.aop.support.AopUtils;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Service;

import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 高风险审计启动期校验器。
 */
public class HighRiskAuditVerifier implements SmartInitializingSingleton {

    private static final String[] HIGH_RISK_KEYWORDS = {
            "delete", "remove", "disable", "reset", "revoke", "terminate", "cancel"
    };

    private final ApplicationContext applicationContext;

    public HighRiskAuditVerifier(ApplicationContext applicationContext) {
        this.applicationContext = applicationContext;
    }

    @Override
    public void afterSingletonsInstantiated() {
        Map<String, Object> beans = applicationContext.getBeansOfType(Object.class);
        List<String> violations = new ArrayList<>();
        for (Object bean : beans.values()) {
            Class<?> targetClass = AopUtils.getTargetClass(bean);
            if (targetClass == null
                    || !targetClass.getName().startsWith("com.cloudflow")
                    || !targetClass.isAnnotationPresent(Service.class)
                    || !targetClass.getPackageName().contains(".service")) {
                continue;
            }
            for (Method method : targetClass.getDeclaredMethods()) {
                if (method.isSynthetic()
                        || Modifier.isPrivate(method.getModifiers())
                        || !Modifier.isPublic(method.getModifiers())) {
                    continue;
                }
                if (!looksHighRisk(method.getName())) {
                    continue;
                }
                Audit audit = method.getAnnotation(Audit.class);
                if (audit == null || !audit.highRisk()) {
                    violations.add(targetClass.getName() + "#" + method.getName());
                }
            }
        }
        if (!violations.isEmpty()) {
            throw new ServiceException("高风险方法缺少 @Audit(highRisk=true): " + String.join(", ", violations),
                    ErrorCodeConstants.AUDIT_CONFIGURATION_ERROR);
        }
    }

    private boolean looksHighRisk(String methodName) {
        String lower = methodName.toLowerCase(Locale.ROOT);
        for (String keyword : HIGH_RISK_KEYWORDS) {
            if (lower.contains(keyword)) {
                return true;
            }
        }
        return false;
    }
}
