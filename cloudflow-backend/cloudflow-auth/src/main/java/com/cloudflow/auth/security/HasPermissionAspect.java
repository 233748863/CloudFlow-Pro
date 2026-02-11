package com.cloudflow.auth.security;

import com.cloudflow.auth.annotation.HasPermission;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * @HasPermission 注解的 AOP 切面（参考 Poco 的 PocoSecurityInnerAspect）
 * 拦截标注了 @HasPermission 的 Controller 方法，校验当前用户是否拥有所需权限
 */
@Aspect
@Component
@Order(1)
public class HasPermissionAspect {

    @Autowired
    private PermissionService permissionService;

    @Around("@annotation(hasPermission)")
    public Object around(ProceedingJoinPoint point, HasPermission hasPermission) throws Throwable {
        String[] permissions = hasPermission.value();
        if (permissions.length > 0 && !permissionService.hasPermission(permissions)) {
            throw new RuntimeException("没有访问权限，请联系管理员授权");
        }
        return point.proceed();
    }
}
