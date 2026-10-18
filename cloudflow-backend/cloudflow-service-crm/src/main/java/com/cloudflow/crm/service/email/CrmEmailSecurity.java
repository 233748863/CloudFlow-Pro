package com.cloudflow.crm.service.email;

import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.cloudflow.crm.exception.CrmBusinessException;
import java.net.URI;
import java.net.IDN;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

public final class CrmEmailSecurity {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Pattern TOKEN = Pattern.compile("[A-Za-z0-9_-]{43}");
    private static final Pattern LOCAL_ADDRESS = Pattern.compile("[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*");
    private static final Pattern DOMAIN = Pattern.compile("[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\\.[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?");
    private static final Pattern ENCODED_UNSAFE = Pattern.compile("%(?:0[0-9a-f]|1[0-9a-f]|25|5c|7f)", Pattern.CASE_INSENSITIVE);

    private CrmEmailSecurity() { }

    public static String newToken() {
        byte[] random = new byte[32];
        RANDOM.nextBytes(random);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(random);
    }

    public static String tokenHash(String token) {
        if (token == null || !TOKEN.matcher(token).matches()) throw invalidToken();
        byte[] decoded = Base64.getUrlDecoder().decode(token);
        if (decoded.length != 32 || !Base64.getUrlEncoder().withoutPadding().encodeToString(decoded).equals(token)) throw invalidToken();
        return MessagePayloadCodec.hash(token);
    }

    public static String address(String input) {
        if (input == null || input.length() > 254 || input.chars().anyMatch(character -> character < 32 || character == 127)) throw invalidAddress();
        String value = input.trim();
        int separator = value.indexOf('@');
        if (value.length() > 254 || separator < 1 || separator > 64 || separator != value.lastIndexOf('@')
                || !LOCAL_ADDRESS.matcher(value.substring(0, separator)).matches()) throw invalidAddress();
        try {
            String domain = IDN.toASCII(value.substring(separator + 1), IDN.USE_STD3_ASCII_RULES).toLowerCase(Locale.ROOT);
            if (!DOMAIN.matcher(domain).matches()) throw invalidAddress();
            value = value.substring(0, separator) + "@" + domain;
            if (value.length() > 254) throw invalidAddress();
        }
        catch (IllegalArgumentException invalid) { throw invalidAddress(); }
        return value;
    }

    public static String emailHash(String address) { return MessagePayloadCodec.hash(address(address)); }

    public static String maskAddress(String input) {
        String normalized = address(input);
        String domain = normalized.substring(normalized.indexOf('@') + 1);
        return normalized.substring(0, 1) + "***@" + (domain.length() <= 95 ? domain : "***");
    }

    public static String host(String input) {
        if (input == null || input.length() > 253) throw invalidLink();
        String normalized = input.toLowerCase(Locale.ROOT);
        if (!DOMAIN.matcher(normalized).matches() || normalized.endsWith(".localhost")
                || normalized.endsWith(".local") || normalized.endsWith(".internal") || normalized.endsWith(".invalid")) throw invalidLink();
        return normalized;
    }

    public static String destination(String input, Set<String> allowedHosts) {
        URI uri = secureUri(input);
        String normalizedHost = host(uri.getHost());
        if (allowedHosts == null || !allowedHosts.contains(normalizedHost)) throw invalidLink();
        String suffix = (uri.getRawPath() == null || uri.getRawPath().isEmpty() ? "/" : uri.getRawPath())
                + (uri.getRawQuery() == null ? "" : "?" + uri.getRawQuery())
                + (uri.getRawFragment() == null ? "" : "#" + uri.getRawFragment());
        return "https://" + normalizedHost + suffix;
    }

    public static String publicOrigin(String input) {
        URI uri = secureUri(input);
        if (uri.getRawQuery() != null || uri.getRawFragment() != null
                || uri.getRawPath() != null && !Set.of("", "/").contains(uri.getRawPath())) throw invalidLink();
        return "https://" + host(uri.getHost());
    }

    public static String trackingUrl(String origin, String action, String token) {
        if (action == null || !Set.of("open", "click", "unsubscribe").contains(action)) throw invalidLink();
        tokenHash(token);
        return publicOrigin(origin) + "/crm/track/" + action + "?token=" + token;
    }

    public static String escape(String input) {
        return input == null ? "" : input.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("\"", "&quot;").replace("'", "&#39;");
    }

    private static URI secureUri(String input) {
        if (input == null || input.isBlank() || input.length() > 2000 || input.indexOf('\\') >= 0
                || input.chars().anyMatch(character -> character <= 32 || character >= 127)
                || ENCODED_UNSAFE.matcher(input).find()) throw invalidLink();
        try {
            URI uri = URI.create(input);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getRawUserInfo() != null
                    || uri.getPort() != -1 && uri.getPort() != 443) throw invalidLink();
            host(uri.getHost());
            return uri;
        } catch (IllegalArgumentException invalid) { throw invalidLink(); }
    }

    private static CrmBusinessException invalidToken() { return new CrmBusinessException("MAIL_TOKEN_INVALID: 邮件链接无效"); }
    private static CrmBusinessException invalidAddress() { return new CrmBusinessException("MAIL_ADDRESS_INVALID: 邮箱格式无效"); }
    private static CrmBusinessException invalidLink() { return new CrmBusinessException("MAIL_LINK_INVALID: 邮件链接须使用允许域名的HTTPS地址"); }
}
