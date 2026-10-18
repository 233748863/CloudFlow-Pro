package com.cloudflow.auth.im;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.function.Supplier;
import java.util.function.Consumer;
import me.chanjar.weixin.common.util.http.RequestExecutor;
import me.chanjar.weixin.cp.api.impl.WxCpServiceImpl;

final class WeComSdk extends WxCpServiceImpl {
    private final WeComCredentials credentials;
    private final WeComHttp http;
    private final Supplier<String> tokens;
    private final Consumer<String> invalidTokens;

    WeComSdk(WeComCredentials credentials, WeComHttp http, Supplier<String> tokens, Consumer<String> invalidTokens) {
        this.credentials = credentials;
        this.http = http;
        this.tokens = tokens;
        this.invalidTokens = invalidTokens;
        setWxCpConfigStorage(credentials.sdkConfiguration());
        setMaxRetryTimes(0);
    }

    @Override
    public void initHttp() { }

    @Override
    public String getAccessToken(boolean forceRefresh) {
        if (forceRefresh) throw ImFailure.unsupported();
        return tokens.get();
    }

    @Override
    public String get(String url, String queryParam) {
        if (queryParam != null && !queryParam.isEmpty()) throw ImFailure.configuration();
        return exchange("GET", url, null);
    }

    @Override
    public String post(String url, String postData) {
        return exchange("POST", url, postData);
    }

    @Override
    public <Response, Request> Response execute(RequestExecutor<Response, Request> executor, String uri, Request data) {
        throw ImFailure.unsupported();
    }

    static ImAccessTokens.Grant fetchToken(WeComCredentials credentials, WeComHttp http) {
        String url = "https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=" + encode(credentials.corpId())
                + "&corpsecret=" + encode(credentials.appSecret());
        try {
            JsonNode result = new ObjectMapper().readTree(http.exchange("GET", URI.create(url), null));
            if (!result.path("access_token").isTextual() || !result.path("expires_in").isIntegralNumber()
                    || !result.path("expires_in").canConvertToInt()) throw ImFailure.remote();
            return new ImAccessTokens.Grant(result.path("access_token").textValue(), result.path("expires_in").intValue());
        } catch (IOException failure) {
            throw ImFailure.remote();
        }
    }

    private String exchange(String method, String url, String content) {
        try {
            URI uri = URI.create(url);
            WeComHttp.validate(method, uri);
            if (uri.getPath().equals("/cgi-bin/gettoken") || url.contains("access_token")) throw ImFailure.configuration();
            String accessToken = tokens.get();
            URI authorized = URI.create(url + (uri.getRawQuery() == null ? "?" : "&") + "access_token=" + encode(accessToken));
            try {
                return http.exchange(method, authorized, content);
            } catch (ImFailure failure) {
                if ("IM_TOKEN_REJECTED".equals(failure.getReasonCode())) invalidTokens.accept(accessToken);
                throw failure;
            }
        } catch (IllegalArgumentException failure) {
            throw ImFailure.configuration();
        }
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    @Override
    public String toString() { return "WeComSdk[configId=" + credentials.configId() + "]"; }
}
