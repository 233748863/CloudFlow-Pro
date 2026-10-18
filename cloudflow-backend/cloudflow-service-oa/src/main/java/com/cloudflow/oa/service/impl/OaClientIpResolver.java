package com.cloudflow.oa.service.impl;

import com.cloudflow.common.redis.core.SysConfigHelper;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.net.InetAddress;
import java.util.Arrays;
import java.util.List;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class OaClientIpResolver {
    private final SysConfigHelper config;

    public record Resolution(String ip, boolean warning) { }

    public Resolution resolve(HttpServletRequest request) {
        String remote = canonical(request.getRemoteAddr());
        if (remote == null) throw new IllegalArgumentException("请求来源地址无效");
        List<String> trustedCidrs = Arrays.stream(config.getConfigValue("sys.oa.contract.sign.trustedProxyCidrs", "127.0.0.1/32,::1/128").split(",")).map(String::trim).toList();
        boolean trusted = trustedCidrs.stream().anyMatch(cidr -> inRange(remote, cidr));
        String chain = config.getConfigValue("sys.oa.contract.sign.ipHeaders", "X-Forwarded-For,X-Real-IP,remoteAddr");
        for (String name : chain.split(",")) {
            name = name.trim();
            if (!Set.of("X-Forwarded-For", "X-Real-IP", "remoteAddr").contains(name)) throw new IllegalStateException("签署IP解析链配置无效");
            if ("remoteAddr".equals(name)) return new Resolution(remote, privateAddress(remote));
            if (!trusted) continue;
            String value = request.getHeader(name);
            if (value == null || value.length() > 2048) continue;
            if ("X-Forwarded-For".equals(name)) {
                List<String> addresses = Arrays.stream(value.split(",")).map(String::trim).map(OaClientIpResolver::canonical).toList();
                if (addresses.isEmpty() || addresses.stream().anyMatch(java.util.Objects::isNull)) continue;
                for (int index = addresses.size() - 1; index >= 0; index--) {
                    String address = addresses.get(index);
                    if (trustedCidrs.stream().noneMatch(cidr -> inRange(address, cidr))) return new Resolution(address, privateAddress(address));
                }
                return new Resolution(addresses.get(0), true);
            }
            String address = canonical(value.trim());
            if (address != null) return new Resolution(address, privateAddress(address));
        }
        return new Resolution(remote, privateAddress(remote));
    }

    public static String canonical(String value) {
        if (value == null || value.isBlank() || value.length() > 45 || !value.matches("[0-9a-fA-F:.]+")) return null;
        if (!value.contains(":")) {
            String[] octets = value.split("\\.");
            if (octets.length != 4) return null;
            for (String octet : octets) {
                if (octet.isEmpty() || octet.length() > 3 || !octet.matches("[0-9]+") || Integer.parseInt(octet) > 255) return null;
            }
        }
        try { return InetAddress.getByName(value).getHostAddress(); }
        catch (Exception exception) { return null; }
    }

    public static boolean privateAddress(String value) {
        String literal = canonical(value); if (literal == null) return true;
        try {
            InetAddress address = InetAddress.getByName(literal); byte[] bytes = address.getAddress();
            return address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress() || address.isSiteLocalAddress()
                    || address.isMulticastAddress() || bytes.length == 16 && (bytes[0] & 0xfe) == 0xfc
                    || bytes.length == 4 && (bytes[0] & 0xff) == 100 && (bytes[1] & 0xc0) == 64;
        } catch (Exception exception) { return true; }
    }

    private static boolean inRange(String address, String cidr) {
        if (cidr.isBlank()) return false;
        String[] parts = cidr.split("/"); String base = canonical(parts[0]);
        if (base == null || parts.length > 2) throw new IllegalStateException("可信代理地址配置无效");
        try {
            byte[] target = InetAddress.getByName(address).getAddress(); byte[] network = InetAddress.getByName(base).getAddress();
            int bits = parts.length == 2 ? Integer.parseInt(parts[1]) : network.length * 8;
            if (bits < 0 || bits > network.length * 8) throw new IllegalArgumentException();
            if (target.length != network.length) return false;
            for (int index = 0; index < target.length; index++) {
                int prefixBits = Math.min(8, Math.max(0, bits - index * 8));
                int mask = prefixBits == 0 ? 0 : 0xff << (8 - prefixBits);
                if ((target[index] & mask) != (network[index] & mask)) return false;
            }
            return true;
        } catch (Exception exception) { throw new IllegalStateException("可信代理网段配置无效", exception); }
    }
}
