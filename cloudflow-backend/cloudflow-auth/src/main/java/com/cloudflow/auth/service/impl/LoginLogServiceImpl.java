package com.cloudflow.auth.service.impl;

import com.cloudflow.auth.service.LoginLogService;
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
 * ?????????
 * <p>
 * ?????
 * 1. ?????? common-log ? sys_log ??????????
 * 2. ?? requestUri=/login ????????????????
 * 3. ??????????????????????????
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LoginLogServiceImpl implements LoginLogService {

    private static final String LOGIN_URI = "/login";

    private final ApplicationEventPublisher eventPublisher;
    private final TenantConfigProperties tenantConfigProperties;
    private final ObjectMapper objectMapper;

    @Override
    public void recordLoginSuccess(String username, Long tenantId, HttpServletRequest request, long costMs) {
        publishLoginEvent(username, tenantId, request, LogTypeEnum.NORMAL.getType(), "????", null, costMs);
    }

    @Override
    public void recordLoginFailure(String username, Long tenantId, HttpServletRequest request, String reason, long costMs) {
        publishLoginEvent(username, tenantId, request, LogTypeEnum.ERROR.getType(), "????", reason, costMs);
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
            log.warn("????????: username={}, reason={}", username, ex.getMessage());
        }
    }

    /**
     * ???????????????????????????
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
