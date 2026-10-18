package com.cloudflow.common.log.web;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.utils.LogSanitizer;
import com.cloudflow.common.core.utils.SensitiveLogPolicy;
import com.cloudflow.common.log.domain.SysApiErrorLog;
import com.cloudflow.common.log.domain.SysLogEntity;
import com.cloudflow.common.log.event.ApiErrorLogEvent;
import com.cloudflow.common.log.util.SysLogUtils;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.web.servlet.ModelAndView;
import org.springframework.web.servlet.handler.AbstractHandlerExceptionResolver;

@Slf4j
@RequiredArgsConstructor
public class ApiErrorLogResolver extends AbstractHandlerExceptionResolver {
    private static final String CAPTURED = ApiErrorLogResolver.class.getName();
    private final ApplicationEventPublisher publisher;

    @Override
    protected ModelAndView doResolveException(HttpServletRequest request, HttpServletResponse response, Object handler, Exception exception) {
        if (request.getAttribute(CAPTURED) != null) return null;
        request.setAttribute(CAPTURED, true);
        try {
            boolean sensitive = SensitiveLogPolicy.isSensitive(request, handler) || SensitiveLogPolicy.isSensitive(request)
                    || "cn.dev33.satoken.exception.NotLoginException".equals(exception.getClass().getName());
            SysLogEntity snapshot = SysLogUtils.buildSysLog(request, sensitive);
            SysApiErrorLog entry = new SysApiErrorLog();
            entry.setTenantId(snapshot.getTenantId());
            entry.setTraceId(snapshot.getTraceId());
            entry.setServiceName(LogSanitizer.limit(snapshot.getServiceName(), 50));
            entry.setUserId(UserContext.getUserId());
            entry.setUserName(snapshot.getCreateBy());
            entry.setRequestMethod(snapshot.getRequestMethod());
            entry.setRequestUrl(snapshot.getRequestUrl());
            entry.setRequestParams(snapshot.getParams());
            entry.setExceptionClass(LogSanitizer.limit(exception.getClass().getName(), 200));
            if (!sensitive) {
                entry.setExceptionMessage(LogSanitizer.limit(exception.getMessage(), 2000));
                entry.setExceptionStack(LogSanitizer.stack(exception));
            }
            entry.setClientIp(snapshot.getClientIp());
            entry.setUserAgent(snapshot.getUserAgent());
            entry.setOccurTime(snapshot.getCreateTime());
            entry.setCreateTime(snapshot.getCreateTime());
            entry.setProcessStatus("TODO");
            publisher.publishEvent(new ApiErrorLogEvent(entry));
        } catch (Exception captureFailure) {
            log.error("错误日志投递失败: {}", captureFailure.getClass().getSimpleName());
        }
        return null;
    }
}
