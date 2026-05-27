package com.cloudflow.auth.service.impl;

import com.cloudflow.auth.service.ILoginLogService;
import com.cloudflow.common.log.domain.SysLogEntity;
import com.cloudflow.common.log.enums.LogTypeEnum;
import com.cloudflow.common.log.event.SysLogEvent;
import com.cloudflow.common.log.util.SysLogUtils;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 登录日志服务实现。
 * <p>
 * 职责：
 * 1. 复用 common-log 的 sys_log 表作为登录日志存储。
 * 2. 通过 requestUri=/login 与普通操作日志隔离。
 * 3. 统一封装登录成功 / 失败日志的构建与发布。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LoginLogServiceImpl implements ILoginLogService {

    private static final String LOGIN_URI = "/login";
    private static final String LOGIN_SUCCESS_TITLE = "用户登录";
    private static final String LOGIN_FAILURE_TITLE = "用户登录失败";

    private final ApplicationEventPublisher eventPublisher;
    private final TenantConfigProperties tenantConfigProperties;
    private final ObjectMapper objectMapper;

    @Override
    public void recordLoginSuccess(String username, Long tenantId, HttpServletRequest request, long costMs) {
        publishLoginEvent(username, tenantId, request, LogTypeEnum.NORMAL.getType(), LOGIN_SUCCESS_TITLE, null, costMs);
    }

    @Override
    public void recordLoginFailure(String username, Long tenantId, HttpServletRequest request, String reason, long costMs) {
        publishLoginEvent(username, tenantId, request, LogTypeEnum.ERROR.getType(), LOGIN_FAILURE_TITLE, reason, costMs);
    }

    @Override
    public boolean isLoginLog(SysLogEntity logEntity) {
        return logEntity != null && LOGIN_URI.equals(logEntity.getRequestUri());
    }

    private void publishLoginEvent(String username,
                                   Long tenantId,
                                   HttpServletRequest request,
                                   String logType,
                                   String title,
                                   String exception,
                                   long costMs) {
        try {
            SysLogEntity sysLog = SysLogUtils.buildSysLog();
            sysLog.setRequestUri(LOGIN_URI);
            sysLog.setMethod(request.getMethod());
            sysLog.setLogType(logType);
            sysLog.setTitle(title);
            sysLog.setCreateBy(username);
            sysLog.setTenantId(tenantId != null ? tenantId : tenantConfigProperties.getDefaultTenantId());
            sysLog.setTime(Math.max(costMs, 0L));
            sysLog.setParams(buildSafeParams(username));
            sysLog.setException(exception);
            eventPublisher.publishEvent(new SysLogEvent(sysLog));
        } catch (Exception ex) {
            log.warn("记录登录日志失败: username={}, reason={}", username, ex.getMessage());
        }
    }

    /**
     * 仅保留安全字段，避免将密码等敏感信息写入日志。
     */
    private String buildSafeParams(String username) {
        try {
            Map<String, Object> params = new LinkedHashMap<>();
            params.put("username", username);
            return objectMapper.writeValueAsString(params);
        } catch (Exception ex) {
            return "{\"username\":\"" + (username == null ? "" : username) + "\"}";
        }
    }
}
