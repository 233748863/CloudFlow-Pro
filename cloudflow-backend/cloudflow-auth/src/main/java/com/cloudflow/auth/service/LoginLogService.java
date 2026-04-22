package com.cloudflow.auth.service;

import com.cloudflow.common.log.domain.SysLogEntity;
import jakarta.servlet.http.HttpServletRequest;

/**
 * 登录日志服务。
 * <p>
 * 负责封装登录成功 / 失败场景的日志记录逻辑。
 */
public interface LoginLogService {

    /**
     * 记录登录成功日志。
     */
    void recordLoginSuccess(String username, Long tenantId, HttpServletRequest request, long costMs);

    /**
     * 记录登录失败日志。
     */
    void recordLoginFailure(String username, Long tenantId, HttpServletRequest request, String reason, long costMs);

    /**
     * 判断日志记录是否属于登录日志。
     */
    boolean isLoginLog(SysLogEntity logEntity);
}
