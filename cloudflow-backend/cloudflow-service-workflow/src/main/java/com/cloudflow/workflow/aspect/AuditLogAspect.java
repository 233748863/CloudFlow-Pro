package com.cloudflow.workflow.aspect;

import com.cloudflow.workflow.annotation.AuditLog;
import com.cloudflow.workflow.service.IAuditLogService;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.lang.reflect.Method;

/**
 * 审计日志切面
 * 自动记录带有 @AuditLog 注解的方法的审计日志
 * 
 * @author CloudFlow
 */
@Slf4j
@Aspect
@Component
public class AuditLogAspect {

    @Autowired
    private IAuditLogService auditLogService;

    /**
     * 环绕通知：记录审计日志
     */
    @Around("@annotation(com.cloudflow.workflow.annotation.AuditLog)")
    public Object around(ProceedingJoinPoint joinPoint) throws Throwable {
        // 获取方法签名
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        Method method = signature.getMethod();
        
        // 获取注解
        AuditLog auditLog = method.getAnnotation(AuditLog.class);
        if (auditLog == null) {
            return joinPoint.proceed();
        }

        // 获取方法参数
        Object[] args = joinPoint.getArgs();
        String targetId = extractTargetId(args);
        String targetName = extractTargetName(args);
        String reason = extractReason(args);

        try {
            // 执行目标方法
            Object result = joinPoint.proceed();
            
            // 记录成功的审计日志
            auditLogService.log(
                auditLog.operationType(),
                auditLog.targetType(),
                targetId,
                targetName,
                reason
            );
            
            return result;
            
        } catch (Throwable e) {
            // 记录失败的审计日志
            auditLogService.logFailure(
                auditLog.operationType(),
                auditLog.targetType(),
                targetId,
                targetName,
                reason,
                e.getMessage()
            );
            
            // 重新抛出异常
            throw e;
        }
    }

    /**
     * 从方法参数中提取目标 ID
     * 假设第一个参数是目标 ID
     */
    private String extractTargetId(Object[] args) {
        if (args == null || args.length == 0) {
            return "UNKNOWN";
        }
        Object firstArg = args[0];
        return firstArg != null ? firstArg.toString() : "UNKNOWN";
    }

    /**
     * 从方法参数中提取目标名称
     * 假设第二个参数是目标名称（如果存在）
     */
    private String extractTargetName(Object[] args) {
        if (args == null || args.length < 2) {
            return "UNKNOWN";
        }
        Object secondArg = args[1];
        return secondArg != null ? secondArg.toString() : "UNKNOWN";
    }

    /**
     * 从方法参数中提取操作原因
     * 假设最后一个 String 类型参数是原因
     */
    private String extractReason(Object[] args) {
        if (args == null || args.length == 0) {
            return null;
        }
        
        // 从后往前查找第一个 String 类型参数
        for (int i = args.length - 1; i >= 0; i--) {
            if (args[i] instanceof String) {
                return (String) args[i];
            }
        }
        
        return null;
    }
}
