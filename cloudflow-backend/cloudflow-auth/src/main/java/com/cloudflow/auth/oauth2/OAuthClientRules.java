package com.cloudflow.auth.oauth2;

import com.cloudflow.common.security.oauth2.OAuthFailure;
import com.cloudflow.common.security.oauth2.OAuthScope;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public final class OAuthClientRules {
    private OAuthClientRules() { }

    public static String redirect(String value, boolean allowLoopbackHttp) {
        if (value == null || value.length() > 1000 || value.isBlank()
                || value.codePoints().anyMatch(character -> character <= 32 || character >= 127)
                || value.contains("\\") || value.contains("*")) throw invalidRedirect();
        try {
            URI uri = URI.create(value);
            boolean loopback = uri.getHost() != null && Set.of("localhost", "127.0.0.1", "[::1]").contains(uri.getHost());
            if (uri.isOpaque() || uri.getHost() == null || uri.getRawUserInfo() != null || uri.getRawFragment() != null
                    || uri.getPort() == 0 || uri.getPort() > 65535 || uri.getPort() < -1
                    || !("https".equals(uri.getScheme()) || allowLoopbackHttp && loopback && "http".equals(uri.getScheme()))) {
                throw invalidRedirect();
            }
            Set<String> names = new HashSet<>();
            if (uri.getRawQuery() != null) {
                for (String parameter : uri.getRawQuery().split("&", -1)) {
                    if (parameter.isEmpty()) throw invalidRedirect();
                    String name = URLDecoder.decode(parameter.split("=", 2)[0], StandardCharsets.UTF_8);
                    if (name.isEmpty() || !names.add(name) || Set.of("code", "state", "error", "error_description").contains(name)) {
                        throw invalidRedirect();
                    }
                }
            }
            String decoded = URLDecoder.decode(value, StandardCharsets.UTF_8);
            if (decoded.codePoints().anyMatch(character -> character < 32 || character == 127) || decoded.contains("\\")) throw invalidRedirect();
            return value;
        } catch (IllegalArgumentException invalid) {
            throw invalidRedirect();
        }
    }

    public static List<String> distinct(List<String> values, int maximum, boolean required) {
        if (values == null) {
            if (required) throw OAuthFailure.invalid("缺少必填的授权配置");
            return List.of();
        }
        if (values.size() > maximum || required && values.isEmpty()) throw OAuthFailure.invalid("授权配置数量不合法");
        Set<String> seen = new HashSet<>();
        List<String> result = new ArrayList<>();
        for (String value : values) {
            if (value == null || value.isBlank() || !value.equals(value.trim()) || !seen.add(value)) {
                throw OAuthFailure.invalid("授权配置不能为空、重复或包含首尾空白");
            }
            result.add(value);
        }
        return List.copyOf(result);
    }

    public static List<String> scopes(List<String> values) {
        List<String> result = distinct(values, 4, true);
        result.forEach(OAuthScope::require);
        return result.stream().sorted().toList();
    }

    public static List<String> scopes(String value) {
        if (value == null || value.isEmpty() || value.length() > 256) throw new OAuthFailure("invalid_scope", "请指定获准的授权范围", 400);
        return scopes(List.of(value.split(" ", -1)));
    }

    public static void subset(List<String> selected, List<String> allowed) {
        if (selected == null || allowed == null || !allowed.containsAll(selected)) {
            throw new OAuthFailure("invalid_scope", "申请范围超出已批准的上限", 400);
        }
    }

    public static void page(int pageNum, int pageSize) {
        if (pageNum < 1 || pageNum > 1000000 || pageSize < 1 || pageSize > 100) throw OAuthFailure.invalid("分页参数不合法");
    }

    private static OAuthFailure invalidRedirect() {
        return OAuthFailure.invalid("回调地址必须是无歧义的精确HTTPS地址");
    }
}
