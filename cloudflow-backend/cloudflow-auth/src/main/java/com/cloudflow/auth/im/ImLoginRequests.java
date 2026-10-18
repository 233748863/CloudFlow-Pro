package com.cloudflow.auth.im;

import com.cloudflow.auth.mapper.ImMapper;
import com.cloudflow.common.core.utils.IpUtils;
import com.cloudflow.common.security.im.ImLoginTransport;
import com.cloudflow.common.tenant.TenantBroker;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import java.util.Arrays;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ImLoginRequests {
    private static final DefaultRedisScript<Long> LIMIT = new DefaultRedisScript<>(
            "local count=redis.call('incr',KEYS[1]); if count==1 or redis.call('ttl',KEYS[1])<0 then redis.call('expire',KEYS[1],60) end; return count", Long.class);
    private static final Set<String> FORWARDED = Set.of("x-forwarded-for", "x-real-ip", "proxy-client-ip", "wl-proxy-client-ip",
            "http_client_ip", "http_x_forwarded_for", "forwarded", "x-forwarded-ssl");
    private final ImProperties properties;
    private final ImMapper mapper;
    private final StringRedisTemplate redis;

    public HttpServletRequest begin(HttpServletRequest request, boolean callback) {
        if (!properties.isEnabled()) throw ImFailure.disabled();
        String origin = ImConfigRules.origin(properties.getPublicUrl());
        if (request == null || origin == null) throw ImFailure.configuration();
        boolean secure = request.isSecure() || IpUtils.isTrustedProxy(request.getRemoteAddr())
                && "https".equalsIgnoreCase(singleHeader(request, "X-Forwarded-Proto"));
        if (!secure) throw ImFailure.loginTransport();
        if (!callback && (singleHeader(request, "Origin") != null && !origin.equals(singleHeader(request, "Origin"))
                || "cross-site".equalsIgnoreCase(singleHeader(request, "Sec-Fetch-Site")))) throw ImFailure.loginTransport();
        String address = address(request);
        limit("ip:" + ImLoginChallenges.digest(address), 20);
        HttpServletRequest normalized = new HttpServletRequestWrapper(request) {
            @Override public String getRemoteAddr() { return address; }
            @Override public boolean isSecure() { return true; }
            @Override public String getHeader(String name) {
                if (name != null && FORWARDED.contains(name.toLowerCase(Locale.ROOT))) return null;
                if ("X-Forwarded-Proto".equalsIgnoreCase(name)) return "https";
                return super.getHeader(name);
            }
            @Override public Enumeration<String> getHeaders(String name) {
                if (name != null && FORWARDED.contains(name.toLowerCase(Locale.ROOT))) return Collections.emptyEnumeration();
                if ("X-Forwarded-Proto".equalsIgnoreCase(name)) return Collections.enumeration(List.of("https"));
                return super.getHeaders(name);
            }
            @Override public Enumeration<String> getHeaderNames() {
                return Collections.enumeration(Collections.list(super.getHeaderNames()).stream()
                        .filter(name -> !FORWARDED.contains(name.toLowerCase(Locale.ROOT))).toList());
            }
        };
        recheck(normalized);
        return normalized;
    }

    public void account(ImLoginAccounts.Account account) {
        if (account == null) throw ImFailure.loginAccount();
        account(account.tenantId(), account.userId());
    }

    public void account(long tenantId, long userId) {
        if (tenantId <= 0 || userId <= 0) throw ImFailure.loginAccount();
        limit("account:" + tenantId + ":" + userId, 5);
    }

    public void recheck(HttpServletRequest request) {
        byte[] address = numeric(request.getRemoteAddr());
        List<IpRule> rules = TenantBroker.applyWithoutTenant(ignored -> mapper.loginIpRules());
        if (rules == null || rules.size() > 10000) throw ImFailure.loginUnavailable();
        for (IpRule rule : rules) {
            if (rule == null || !Set.of("BLACK", "WHITE").contains(rule.mode())) throw ImFailure.loginUnavailable();
            if (!matches(address, rule)) continue;
            if ("BLACK".equals(rule.mode())) throw ImFailure.loginIp();
            return;
        }
    }

    private void limit(String suffix, int maximum) {
        Long count;
        try { count = redis.execute(LIMIT, List.of("cloudflow:im:login-limit:" + suffix)); }
        catch (RuntimeException failure) { throw ImFailure.loginUnavailable(); }
        if (count == null || count <= 0) throw ImFailure.loginUnavailable();
        if (count > maximum) throw ImFailure.loginRate();
    }

    private String address(HttpServletRequest request) {
        try {
            numeric(request.getRemoteAddr());
            String forwarded = IpUtils.isTrustedProxy(request.getRemoteAddr()) ? singleHeader(request, "X-Forwarded-For") : null;
            return ImLoginTransport.address(request.getRemoteAddr(), forwarded);
        } catch (IllegalArgumentException failure) { throw ImFailure.loginTransport(); }
    }

    private static String singleHeader(HttpServletRequest request, String name) {
        Enumeration<String> values = request.getHeaders(name);
        if (values == null || !values.hasMoreElements()) return null;
        String value = values.nextElement();
        if (values.hasMoreElements() || value == null || value.length() > 1024
                || value.codePoints().anyMatch(Character::isISOControl)) throw ImFailure.loginTransport();
        return value;
    }

    static boolean matches(byte[] address, IpRule rule) {
        if (rule.pattern() == null || rule.type() == null) throw ImFailure.loginUnavailable();
        if ("EXACT".equals(rule.type())) return Arrays.equals(address, numeric(rule.pattern()));
        if ("CIDR".equals(rule.type())) {
            String[] parts = rule.pattern().split("/", -1);
            if (parts.length == 1) return Arrays.equals(address, numeric(parts[0]));
            if (parts.length != 2 || !parts[1].matches("[0-9]{1,3}")) throw ImFailure.loginUnavailable();
            byte[] base = numeric(parts[0]);
            int prefix = Integer.parseInt(parts[1]);
            if (prefix > base.length * 8) throw ImFailure.loginUnavailable();
            if (address.length != base.length) return false;
            for (int index = 0; index < base.length; index++) {
                int bits = Math.min(8, Math.max(0, prefix - index * 8));
                int mask = (255 << (8 - bits)) & 255;
                if ((address[index] & mask) != (base[index] & mask)) return false;
            }
            return true;
        }
        if ("RANGE".equals(rule.type())) {
            String[] parts = rule.pattern().split("-", -1);
            if (parts.length == 1) return Arrays.equals(address, numeric(parts[0]));
            if (parts.length != 2) throw ImFailure.loginUnavailable();
            byte[] lower = numeric(parts[0].trim());
            byte[] upper = numeric(parts[1].trim());
            if (lower.length != upper.length) throw ImFailure.loginUnavailable();
            if (lower.length != address.length) return false;
            int comparison = Arrays.compareUnsigned(lower, upper);
            return Arrays.compareUnsigned(address, comparison <= 0 ? lower : upper) >= 0
                    && Arrays.compareUnsigned(address, comparison <= 0 ? upper : lower) <= 0;
        }
        throw ImFailure.loginUnavailable();
    }

    static byte[] numeric(String value) {
        try { return ImLoginTransport.numeric(value); }
        catch (IllegalArgumentException failure) { throw ImFailure.loginTransport(); }
    }

    public record IpRule(String pattern, String type, String mode) { }
}
