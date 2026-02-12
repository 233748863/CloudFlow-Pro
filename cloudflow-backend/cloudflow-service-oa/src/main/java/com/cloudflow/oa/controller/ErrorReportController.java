package com.cloudflow.oa.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.FrontendErrorLog;
import com.cloudflow.oa.service.IFrontendErrorLogService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;

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
    public R report(@RequestBody FrontendErrorLog errorLog, HttpServletRequest request) {
        try {
            // 获取客户端真实IP（考虑反向代理场景）
            String clientIp = getClientIp(request);
            frontendErrorLogService.reportError(errorLog, clientIp);
        } catch (Exception e) {
            // 上报接口不应因任何异常返回错误，仅记录日志
            log.error("处理前端错误上报时发生异常: {}", e.getMessage(), e);
        }
        // 始终返回成功，避免前端上报失败引发连锁错误
        return R.ok();
    }

    /**
     * 获取客户端真实IP地址
     * 依次检查常见的代理头，最后降级为 remoteAddr
     */
    private String getClientIp(HttpServletRequest request) {
        String ip = request.getHeader("X-Forwarded-For");
        if (ip != null && !ip.isEmpty() && !"unknown".equalsIgnoreCase(ip)) {
            // X-Forwarded-For 可能包含多个IP，取第一个（客户端真实IP）
            int commaIndex = ip.indexOf(',');
            return commaIndex > 0 ? ip.substring(0, commaIndex).trim() : ip.trim();
        }

        ip = request.getHeader("X-Real-IP");
        if (ip != null && !ip.isEmpty() && !"unknown".equalsIgnoreCase(ip)) {
            return ip.trim();
        }

        ip = request.getHeader("Proxy-Client-IP");
        if (ip != null && !ip.isEmpty() && !"unknown".equalsIgnoreCase(ip)) {
            return ip.trim();
        }

        ip = request.getHeader("WL-Proxy-Client-IP");
        if (ip != null && !ip.isEmpty() && !"unknown".equalsIgnoreCase(ip)) {
            return ip.trim();
        }

        return request.getRemoteAddr();
    }
}
