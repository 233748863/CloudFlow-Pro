package com.cloudflow.auth.service;

import com.cloudflow.common.core.utils.IpUtils;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.lionsoul.ip2region.xdb.Searcher;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
public class IpLocationResolver {

    private static final String UNKNOWN_LABEL = "UNKNOWN";
    private static final String INTERNAL_LABEL = "INTERNAL";

    private byte[] ipv4Buffer;

    @PostConstruct
    public void init() {
        ClassPathResource resource = new ClassPathResource("ip2region/ip2region_v4.xdb");
        if (!resource.exists()) {
            log.warn("ip2region v4 xdb resource not found");
            return;
        }
        try (InputStream inputStream = resource.getInputStream()) {
            ipv4Buffer = inputStream.readAllBytes();
            log.info("ip2region v4 xdb loaded, size={} bytes", ipv4Buffer.length);
        } catch (IOException e) {
            log.warn("failed to load ip2region v4 xdb", e);
        }
    }

    public ResolvedLocation resolve(String ip) {
        String normalizedIp = IpUtils.normalizeIpAddress(ip);
        if (!StringUtils.hasText(normalizedIp) || "unknown".equalsIgnoreCase(normalizedIp)) {
            return new ResolvedLocation(null, UNKNOWN_LABEL);
        }
        if (isInternalAddress(normalizedIp)) {
            return new ResolvedLocation(INTERNAL_LABEL, INTERNAL_LABEL);
        }
        if (normalizedIp.contains(":")) {
            return new ResolvedLocation(null, UNKNOWN_LABEL);
        }
        if (ipv4Buffer == null || ipv4Buffer.length == 0) {
            return new ResolvedLocation(null, UNKNOWN_LABEL);
        }

        try {
            Searcher searcher = Searcher.newWithBuffer(ipv4Buffer);
            String region = searcher.search(normalizedIp);
            return parseRegion(region);
        } catch (Exception e) {
            log.debug("resolve ip region failed, ip={}", normalizedIp, e);
            return new ResolvedLocation(null, UNKNOWN_LABEL);
        }
    }

    public String extractProvince(String label) {
        return parseRegion(label).province();
    }

    private ResolvedLocation parseRegion(String region) {
        if (!StringUtils.hasText(region)) {
            return new ResolvedLocation(null, UNKNOWN_LABEL);
        }
        String normalized = region.trim();
        if (INTERNAL_LABEL.equalsIgnoreCase(normalized) || "内网IP".equalsIgnoreCase(normalized)) {
            return new ResolvedLocation(INTERNAL_LABEL, INTERNAL_LABEL);
        }

        String[] rawParts = normalized.split("\\|");
        List<String> parts = new ArrayList<>();
        for (String rawPart : rawParts) {
            String value = rawPart == null ? "" : rawPart.trim();
            if (!StringUtils.hasText(value) || "0".equals(value)) {
                continue;
            }
            parts.add(value);
        }
        if (parts.isEmpty()) {
            return new ResolvedLocation(null, UNKNOWN_LABEL);
        }

        String province = null;
        for (String part : parts) {
            if (isProvinceToken(part)) {
                province = normalizeProvince(part);
                break;
            }
        }
        if (province == null && !parts.isEmpty()) {
            province = parts.get(0);
        }
        return new ResolvedLocation(province, String.join("|", parts));
    }

    private boolean isProvinceToken(String token) {
        if (!StringUtils.hasText(token)) {
            return false;
        }
        return token.endsWith("省")
                || token.endsWith("自治区")
                || token.endsWith("特别行政区")
                || token.equals("北京市")
                || token.equals("上海市")
                || token.equals("天津市")
                || token.equals("重庆市")
                || token.equals("香港")
                || token.equals("澳门");
    }

    private String normalizeProvince(String token) {
        if ("香港".equals(token)) {
            return "香港特别行政区";
        }
        if ("澳门".equals(token)) {
            return "澳门特别行政区";
        }
        return token;
    }

    private boolean isInternalAddress(String ip) {
        try {
            InetAddress address = InetAddress.getByName(ip);
            return address.isAnyLocalAddress()
                    || address.isLoopbackAddress()
                    || address.isSiteLocalAddress()
                    || address.isLinkLocalAddress();
        } catch (Exception e) {
            return false;
        }
    }

    public record ResolvedLocation(String province, String label) {
    }
}
