package com.cloudflow.common.log.util;

import cn.hutool.extra.spring.SpringUtil;
import com.cloudflow.common.core.context.TraceContext;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.utils.IpUtils;
import com.cloudflow.common.core.utils.LogSanitizer;
import com.cloudflow.common.core.utils.SensitiveLogPolicy;
import com.cloudflow.common.log.config.CloudFlowLogProperties;
import com.cloudflow.common.log.domain.SysLogEntity;
import com.cloudflow.common.sensitive.utils.SensitiveUtils;
import com.cloudflow.common.tenant.TenantContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.StandardReflectionParameterNameDiscoverer;
import org.springframework.expression.EvaluationContext;
import org.springframework.expression.spel.standard.SpelExpressionParser;
import org.springframework.expression.spel.support.StandardEvaluationContext;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.lang.reflect.Method;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Set;

public final class SysLogUtils {
    public static final String OPERATION_LOGGED = SysLogUtils.class.getName() + ".operationLogged";
    public static final String RESULT_CODE = SysLogUtils.class.getName() + ".resultCode";
    private static final Set<String> HTTP_METHODS = Set.of("GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "TRACE");

    private SysLogUtils() {
    }

    public static SysLogEntity buildSysLog() {
        return buildSysLog(currentRequest());
    }

    public static SysLogEntity buildSysLog(HttpServletRequest request) {
        return buildSysLog(request, SensitiveLogPolicy.isSensitive(request));
    }

    public static SysLogEntity buildSysLog(HttpServletRequest request, boolean sensitive) {
        sensitive = sensitive || SensitiveLogPolicy.isSensitive(request);
        SysLogEntity entry = new SysLogEntity();
        entry.setLogType("0");
        entry.setTraceId(TraceContext.currentOrCreate());
        entry.setCreateTime(LocalDateTime.now());
        if (!sensitive) entry.setCreateBy(LogSanitizer.limit(UserContext.getUserName(), 64));
        entry.setServiceName(LogSanitizer.limit(SpringUtil.getProperty("spring.application.name"), 64));
        entry.setServiceId(entry.getServiceName());
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null) tenantId = TenantContext.getTenantId();
        entry.setTenantId(tenantId == null ? 0L : tenantId);
        if (request != null) {
            String path = sensitive ? SensitiveLogPolicy.requestPath(request) : request.getRequestURI();
            entry.setRequestUrl(LogSanitizer.limit(path, 500));
            entry.setRequestUri(LogSanitizer.limit(path, 255));
            String method = request.getMethod();
            entry.setRequestMethod(sensitive && (method == null || !HTTP_METHODS.contains(method))
                    ? "UNKNOWN" : LogSanitizer.limit(method, 10));
            entry.setMethod(entry.getRequestMethod());
            if (sensitive) {
                request.removeAttribute(LogSanitizer.REQUEST_PARAMS_ATTRIBUTE);
            } else {
                entry.setClientIp(LogSanitizer.limit(IpUtils.getIpAddr(request), 64));
                entry.setRemoteAddr(entry.getClientIp());
                entry.setUserAgent(LogSanitizer.limit(request.getHeader("User-Agent"), 500));
                entry.setParams(requestParams(request));
            }
        }
        return entry;
    }

    public static String requestParams(HttpServletRequest request) {
        if (request == null) return null;
        if (SensitiveLogPolicy.isSensitive(request)) {
            request.removeAttribute(LogSanitizer.REQUEST_PARAMS_ATTRIBUTE);
            return null;
        }
        CloudFlowLogProperties properties = SpringUtil.getBean(CloudFlowLogProperties.class);
        if (!properties.isRequestEnabled()) return null;
        Object captured = request.getAttribute(LogSanitizer.REQUEST_PARAMS_ATTRIBUTE);
        if (captured instanceof String value) return value;
        if (request.getParameterMap().isEmpty()) return null;
        Object params = SensitiveUtils.maskRequestParams(new HashMap<>(request.getParameterMap()), properties.getExcludeFields());
        return LogSanitizer.json(params, SpringUtil.getBean(ObjectMapper.class), Math.min(16000, Math.max(256, properties.getMaxLength())));
    }

    public static HttpServletRequest currentRequest() {
        return RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes ? attributes.getRequest() : null;
    }

    public static <T> T getValue(EvaluationContext context, String key, Class<T> type) {
        return new SpelExpressionParser().parseExpression(key).getValue(context, type);
    }

    public static EvaluationContext getContext(Object[] arguments, Method method) {
        String[] names = new StandardReflectionParameterNameDiscoverer().getParameterNames(method);
        EvaluationContext context = new StandardEvaluationContext();
        if (names != null) {
            for (int index = 0; index < arguments.length; index++) context.setVariable(names[index], arguments[index]);
        }
        return context;
    }
}
