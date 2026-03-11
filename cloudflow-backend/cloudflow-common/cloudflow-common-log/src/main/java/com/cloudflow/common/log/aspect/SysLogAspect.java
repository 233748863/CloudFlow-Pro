package com.cloudflow.common.log.aspect;

import cn.hutool.core.util.StrUtil;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.log.domain.SysLogEntity;
import com.cloudflow.common.log.enums.LogTypeEnum;
import com.cloudflow.common.log.event.SysLogEvent;
import com.cloudflow.common.log.util.SysLogUtils;
import com.cloudflow.common.sensitive.utils.SensitiveUtils;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.expression.EvaluationContext;
import org.springframework.validation.BindingResult;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * 操作日志切面
 * <p>
 * 拦截 {@link SysLog} 注解标记的方法，自动收集请求信息、
 * 执行时间、异常等，通过 Spring Event 异步入库。
 * </p>
 * <p>
 * 移植自 poco-common-log 的 SysLogAspect，主要改动：
 * <ul>
 *   <li>用户上下文从 Spring Security 改为 UserContext</li>
 *   <li>租户ID从 KeyStrResolver 改为 TenantContext</li>
 *   <li>日志发布从 SpringContextHolder 改为 ApplicationEventPublisher</li>
 * </ul>
 * </p>
 *
 * @author CloudFlow
 */
@Aspect
@Slf4j
@RequiredArgsConstructor
public class SysLogAspect {

    private final ApplicationEventPublisher eventPublisher;

    private final ObjectMapper objectMapper;

    /** 序列化时忽略的参数类型 */
    private static final List<Class<?>> IGNORE_CLASSES = Arrays.asList(
            HttpServletRequest.class, HttpServletResponse.class,
            ServletRequest.class, BindingResult.class, MultipartFile.class
    );

    @Around("@annotation(sysLog)")
    public Object around(ProceedingJoinPoint point, SysLog sysLog) throws Throwable {
        String strClassName = point.getTarget().getClass().getName();
        String strMethodName = point.getSignature().getName();
        log.debug("[操作日志] 类名:{}, 方法:{}", strClassName, strMethodName);

        // 解析日志描述（支持 SPEL 表达式）
        String value = sysLog.value();
        String expression = sysLog.expression();
        if (StrUtil.isNotBlank(expression)) {
            MethodSignature signature = (MethodSignature) point.getSignature();
            EvaluationContext context = SysLogUtils.getContext(point.getArgs(), signature.getMethod());
            try {
                value = SysLogUtils.getValue(context, expression, String.class);
            } catch (Exception e) {
                log.error("@SysLog 解析SPEL表达式 {} 异常: {}", expression, e.getMessage());
            }
        }

        // 构建日志实体（从请求上下文收集基础信息）
        SysLogEntity logEntity = SysLogUtils.buildSysLog();
        logEntity.setTitle(value);

        // 序列化方法参数为 JSON（过滤不可序列化的类型）
        try {
            Object[] args = point.getArgs();
            List<Object> logArgs = new ArrayList<>();
            for (Object arg : args) {
                if (arg == null) {
                    continue;
                }
                boolean shouldIgnore = IGNORE_CLASSES.stream()
                        .anyMatch(clazz -> clazz.isAssignableFrom(arg.getClass()));
                if (!shouldIgnore) {
                    logArgs.add(arg);
                }
            }
            if (!logArgs.isEmpty() && StrUtil.isBlank(logEntity.getParams())) {
                // ????????????????????????????????
                Object maskedArgs = SensitiveUtils.maskObject(logArgs);
                logEntity.setParams(objectMapper.writeValueAsString(maskedArgs));
            }
        } catch (Exception e) {
            log.warn("操作日志参数序列化失败: {}", e.getMessage());
        }

        // 执行目标方法并计时
        long startTime = System.currentTimeMillis();
        Object result;
        try {
            result = point.proceed();
        } catch (Exception e) {
            // 记录异常信息
            logEntity.setLogType(LogTypeEnum.ERROR.getType());
            logEntity.setException(e.getMessage());
            throw e;
        } finally {
            long endTime = System.currentTimeMillis();
            logEntity.setTime(endTime - startTime);
            // 发布异步日志事件
            eventPublisher.publishEvent(new SysLogEvent(logEntity));
        }

        return result;
    }
}
