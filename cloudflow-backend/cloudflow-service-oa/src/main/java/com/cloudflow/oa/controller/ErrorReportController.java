package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.utils.IpUtils;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.oa.config.properties.OaProperties;
import com.cloudflow.oa.domain.FrontendErrorLog;
import com.cloudflow.oa.service.IFrontendErrorLogService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 前端错误上报 Controller
 *
 * 接收前端 errorReporter 服务上报的错误信息，持久化到数据库。
 * 前端请求路径：/oa/error-report → 网关 StripPrefix=1 → /error-report
 */
@Slf4j
@RestController
@RequestMapping("/error-report")
@RequiredArgsConstructor
public class ErrorReportController {

    private final IFrontendErrorLogService frontendErrorLogService;
    private final OaProperties oaProperties;

    /**
     * 接收前端错误上报
     *
     * 该接口设计为"尽量不失败"：
     * - 即使请求体部分字段缺失也能接收
     * - 异步写入数据库，快速返回响应
     * - 写入失败降级为服务端日志输出
     *
     * @param errorLog 前端上报的错误数据
     * @param request  HTTP请求（用于获取客户端IP）
     * @return 固定返回成功，避免前端因上报失败产生额外错误
     */
    @PostMapping
    @RepeatSubmit(interval = 1000, includeArgs = false, message = "错误上报过于频繁，请稍后再试")
    @SaCheckPermission("oa:error-report:create")
    public R report(@RequestBody FrontendErrorLog errorLog, HttpServletRequest request) {
        try {
            if (!Boolean.TRUE.equals(oaProperties.getErrorReport().getEnabled())) {
                return R.ok();
            }
            if (!isAllowed(errorLog)) {
                log.warn("拒绝前端错误上报，url={}，context={}，message={}", errorLog == null ? null : errorLog.getUrl(), errorLog == null ? null : errorLog.getContext(), errorLog == null ? null : errorLog.getMessage());
                return R.ok();
            }
            String clientIp = getClientIp(request);
            frontendErrorLogService.reportError(errorLog, clientIp);
        } catch (Exception e) {
            log.error("处理前端错误上报时发生异常: {}", e.getMessage(), e);
        }
        return R.ok();
    }

    /**
     * 获取客户端真实IP地址
     * 依次检查常见的代理头，最后降级为 remoteAddr
     */
    private String getClientIp(HttpServletRequest request) {
        return IpUtils.getIpAddr(request);
    }

    private boolean isAllowed(FrontendErrorLog errorLog) {
        if (errorLog == null || !StringUtils.hasText(errorLog.getMessage())) {
            return false;
        }
        String allowAnonymousPath = oaProperties.getErrorReport().getAllowAnonymousPath();
        if (!StringUtils.hasText(allowAnonymousPath)) {
            return true;
        }
        return StringUtils.hasText(errorLog.getUrl()) && errorLog.getUrl().contains(allowAnonymousPath);
    }
}
