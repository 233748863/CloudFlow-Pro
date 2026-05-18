package com.cloudflow.common.core.utils;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.util.StringUtils;

import java.math.BigInteger;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.Collections;
import java.util.List;

/**
 * IP 地址工具类
 */
public class IpUtils {

    private static volatile List<CidrBlock> trustedProxyBlocks = Collections.emptyList();

    /**
     * 获取客户端真实 IP 地址。
     * 当请求来源不是可信代理时，忽略转发头，直接使用 remoteAddr。
     */
    public static String getIpAddr(HttpServletRequest request) {
        if (request == null) {
            return "unknown";
        }

        String remoteAddr = normalizeIp(request.getRemoteAddr());
        if (!isTrustedProxy(remoteAddr)) {
            return remoteAddr;
        }

        String forwardedIp = firstValidIp(
            request.getHeader("X-Forwarded-For"),
            request.getHeader("X-Real-IP"),
            request.getHeader("Proxy-Client-IP"),
            request.getHeader("WL-Proxy-Client-IP"),
            request.getHeader("HTTP_CLIENT_IP"),
            request.getHeader("HTTP_X_FORWARDED_FOR")
        );

        return isValidIp(forwardedIp) ? normalizeIp(forwardedIp) : remoteAddr;
    }

    public static void setTrustedProxies(List<String> trustedProxies) {
        if (trustedProxies == null || trustedProxies.isEmpty()) {
            trustedProxyBlocks = Collections.emptyList();
            return;
        }
        trustedProxyBlocks = trustedProxies.stream()
            .filter(StringUtils::hasText)
            .map(String::trim)
            .map(CidrBlock::parse)
            .toList();
    }

    public static boolean isTrustedProxy(String ip) {
        if (!isValidIp(ip)) {
            return false;
        }
        List<CidrBlock> blocks = trustedProxyBlocks;
        if (blocks.isEmpty()) {
            return false;
        }
        String normalized = normalizeIp(ip);
        for (CidrBlock block : blocks) {
            if (block.matches(normalized)) {
                return true;
            }
        }
        return false;
    }

    public static String normalizeIpAddress(String ip) {
        return normalizeIp(ip);
    }

    private static String firstValidIp(String... candidates) {
        for (String candidate : candidates) {
            if (!StringUtils.hasText(candidate)) {
                continue;
            }
            if (candidate.contains(",")) {
                String[] ips = candidate.split(",");
                for (String ip : ips) {
                    String trimmed = ip.trim();
                    if (isValidIp(trimmed)) {
                        return trimmed;
                    }
                }
                continue;
            }
            if (isValidIp(candidate)) {
                return candidate.trim();
            }
        }
        return null;
    }

    /**
     * 判断 IP 是否有效（非空且非 unknown）
     */
    private static boolean isValidIp(String ip) {
        return StringUtils.hasText(ip) && !"unknown".equalsIgnoreCase(ip);
    }

    /**
     * 归一化常见回环与 IPv4-mapped IPv6 表示，避免日志中出现不直观的地址格式。
     */
    private static String normalizeIp(String ip) {
        if (!isValidIp(ip)) {
            return "unknown";
        }

        String normalized = ip.trim();
        if ("0:0:0:0:0:0:0:1".equals(normalized) || "::1".equals(normalized)) {
            return "127.0.0.1";
        }
        if (normalized.regionMatches(true, 0, "::ffff:", 0, 7)) {
            return normalized.substring(7);
        }
        return normalized;
    }

    private static final class CidrBlock {

        private final BigInteger network;
        private final BigInteger mask;
        private final int bytes;

        private CidrBlock(BigInteger network, BigInteger mask, int bytes) {
            this.network = network;
            this.mask = mask;
            this.bytes = bytes;
        }

        private static CidrBlock parse(String expression) {
            try {
                String candidate = expression;
                int prefixLength;
                if (expression.contains("/")) {
                    String[] parts = expression.split("/", 2);
                    candidate = parts[0].trim();
                    prefixLength = Integer.parseInt(parts[1].trim());
                } else {
                    prefixLength = InetAddress.getByName(candidate).getAddress().length * 8;
                }
                byte[] address = InetAddress.getByName(candidate).getAddress();
                int totalBits = address.length * 8;
                if (prefixLength < 0 || prefixLength > totalBits) {
                    throw new IllegalArgumentException("Invalid CIDR prefix: " + expression);
                }
                BigInteger ipValue = new BigInteger(1, address);
                BigInteger mask = prefixLength == 0
                    ? BigInteger.ZERO
                    : BigInteger.ONE.shiftLeft(prefixLength).subtract(BigInteger.ONE).shiftLeft(totalBits - prefixLength);
                BigInteger network = ipValue.and(mask);
                return new CidrBlock(network, mask, address.length);
            } catch (UnknownHostException e) {
                throw new IllegalArgumentException("Invalid IP/CIDR: " + expression, e);
            }
        }

        private boolean matches(String ip) {
            try {
                byte[] address = InetAddress.getByName(ip).getAddress();
                if (address.length != bytes) {
                    return false;
                }
                BigInteger value = new BigInteger(1, address);
                return value.and(mask).equals(network);
            } catch (UnknownHostException e) {
                return false;
            }
        }
    }
}
