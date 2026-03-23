package com.cloudflow.hr.aspect;

import com.cloudflow.hr.annotation.AuditLog;
import com.cloudflow.hr.service.AuditLogService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.stereotype.Component;

import java.lang.reflect.Method;

/**
 * 审计日志AOP切面
 * 自动记录标记了@AuditLog注解的方法的操作日志
 * 
 * @author CloudFlow
 */
@Slf4j
@Aspect
@Component
@RequiredArgsConstructor
public class AuditLogAspect {
    
    private final AuditLogService auditLogService;
    private final ObjectMapper objectMapper;
    
    /**
     * 环绕通知：记录审计日志
     */
    @Around("@annotation(com.cloudflow.hr.annotation.AuditLog)")
    public Object around(ProceedingJoinPoint joinPoint) throws Throwable {
        long startTime = System.currentTimeMillis();
        
        // 获取注解信息
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        Method method = signature.getMethod();
        AuditLog auditLogAnnotation = method.getAnnotation(AuditLog.class);
        
        // 获取方法参数
        Object[] args = joinPoint.getArgs();
        String beforeData = null;
        String afterData = null;
        Long businessId = null;
        String businessNo = null;
        
        // 记录变更前数据（如果需要）
        if (auditLogAnnotation.recordBefore() && args.length > 0) {
            try {
                // 假设第一个参数是业务ID或DTO对象
                if (args[0] instanceof Long) {
                    businessId = (Long) args[0];
                    // 这里可以根据业务ID查询变更前的数据
                } else {
                    beforeData = objectMapper.writeValueAsString(args[0]);
                }
            } catch (Exception e) {
                log.warn("记录变更前数据失败", e);
            }
        }
        
        // 执行目标方法
        Object result = null;
        String status = "SUCCESS";
        String errorMessage = null;
        
        try {
            result = joinPoint.proceed();
            
            // 记录变更后数据（如果需要）
            if (auditLogAnnotation.recordAfter() && result != null) {
                try {
                    if (result instanceof Long) {
                        businessId = (Long) result;
                    } else {
                        afterData = objectMapper.writeValueAsString(result);
                    }
                } catch (Exception e) {
                    log.warn("记录变更后数据失败", e);
                }
            }
            
            // 尝试从参数中提取业务ID和业务编号
            if (businessId == null && args.length > 0) {
                businessId = extractBusinessId(args[0]);
            }
            businessNo = extractBusinessNo(args);
            
        } catch (Exception e) {
            status = "FAILURE";
            errorMessage = e.getMessage();
            throw e;
        } finally {
            // 计算执行时长
            long executionTime = System.currentTimeMillis() - startTime;
            
            // 异步记录审计日志
            try {
                recordAuditLog(auditLogAnnotation, businessId, businessNo, 
                             beforeData, afterData, status, errorMessage, executionTime);
            } catch (Exception e) {
                log.error("记录审计日志失败", e);
                // 审计日志记录失败不应影响业务操作
            }
        }
        
        return result;
    }
    
    /**
     * 记录审计日志
     */
    private void recordAuditLog(AuditLog annotation, Long businessId, String businessNo,
                               String beforeData, String afterData, String status, 
                               String errorMessage, long executionTime) {
        com.cloudflow.hr.domain.entity.AuditLog auditLog = new com.cloudflow.hr.domain.entity.AuditLog();
        auditLog.setLogType("OPERATION");
        auditLog.setOperationType(annotation.operationType());
        auditLog.setBusinessModule(annotation.businessModule());
        auditLog.setBusinessType(annotation.businessType());
        auditLog.setBusinessId(businessId);
        auditLog.setBusinessNo(businessNo);
        auditLog.setOperationDesc(annotation.description());
        auditLog.setBeforeData(beforeData);
        auditLog.setAfterData(afterData);
        auditLog.setStatus(status);
        auditLog.setErrorMessage(errorMessage);
        auditLog.setExecutionTime(executionTime);
        auditLog.setArchived(0);
        
        // 从上下文获取操作人信息（实际项目中应从SecurityContext获取）
        // auditLog.setOperatorId(SecurityUtils.getUserId());
        // auditLog.setOperatorName(SecurityUtils.getUsername());
        // auditLog.setTenantId(SecurityUtils.getTenantId());
        // auditLog.setIpAddress(ServletUtils.getClientIP());
        // auditLog.setRequestUri(ServletUtils.getRequest().getRequestURI());
        // auditLog.setRequestMethod(ServletUtils.getRequest().getMethod());
        
        auditLogService.saveAuditLog(auditLog);
    }
    
    /**
     * 从参数中提取业务ID
     */
    private Long extractBusinessId(Object arg) {
        if (arg == null) {
            return null;
        }
        
        try {
            // 尝试通过反射获取id字段
            Method getIdMethod = arg.getClass().getMethod("getId");
            Object id = getIdMethod.invoke(arg);
            if (id instanceof Long) {
                return (Long) id;
            }
        } catch (Exception e) {
            // 忽略异常
        }
        
        return null;
    }
    
    /**
     * 从参数中提取业务编号
     */
    private String extractBusinessNo(Object[] args) {
        if (args == null || args.length == 0) {
            return null;
        }
        
        for (Object arg : args) {
            if (arg == null) {
                continue;
            }
            
            try {
                // 尝试获取常见的编号字段
                String[] noFields = {"getApplicationNo", "getEmployeeNo", "getRequestNo", 
                                    "getOfferNo", "getContractNo"};
                for (String fieldName : noFields) {
                    try {
                        Method method = arg.getClass().getMethod(fieldName);
                        Object no = method.invoke(arg);
                        if (no instanceof String) {
                            return (String) no;
                        }
                    } catch (NoSuchMethodException e) {
                        // 继续尝试下一个字段
                    }
                }
            } catch (Exception e) {
                // 忽略异常
            }
        }
        
        return null;
    }
}
