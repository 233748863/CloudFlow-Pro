package com.cloudflow.common.core.utils;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.util.StringUtils;

/**
 * IP 地址工具类
 */
public class IpUtils {

    /**
     * 获取客户端真实 IP 地址
     * 支持多级代理（X-Forwarded-For、Proxy-Client-IP 等）
     *
     * @param request HTTP 请求
     * @return 客户端 IP 地址
     */
    public static String getIpAddr(HttpServletRequest request) {
        if (request == null) {
            return "unknown";
        }

        String ip = request.getHeader("X-Forwarded-For");
        if (!isValidIp(ip)) {
            ip = request.getHeader("Proxy-Client-IP");
        }
        if (!isValidIp(ip)) {
            ip = request.getHeader("WL-Proxy-Client-IP");
        }
        if (!isValidIp(ip)) {
            ip = request.getHeader("X-Real-IP");
        }
        if (!isValidIp(ip)) {
            ip = request.getHeader("HTTP_CLIENT_IP");
        }
        if (!isValidIp(ip)) {
            ip = request.getHeader("HTTP_X_FORWARDED_FOR");
        }
        if (!isValidIp(ip)) {
            ip = request.getRemoteAddr();
        }

        // 多级代理时取第一个非 unknown 的 IP
        if (ip != null && ip.contains(",")) {
            String[] ips = ip.split(",");
            for (String subIp : ips) {
                String trimmed = subIp.trim();
                if (isValidIp(trimmed)) {
                    ip = trimmed;
                    break;
                }
            }
        }

        return "0:0:0:0:0:0:0:1".equals(ip) ? "127.0.0.1" : ip;
    }

    /**
     * 判断 IP 是否有效（非空且非 unknown）
     */
    private static boolean isValidIp(String ip) {
        return StringUtils.hasText(ip) && !"unknown".equalsIgnoreCase(ip);
    }
}
