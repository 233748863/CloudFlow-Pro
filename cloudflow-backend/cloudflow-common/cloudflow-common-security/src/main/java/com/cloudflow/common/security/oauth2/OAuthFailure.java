package com.cloudflow.common.security.oauth2;

import com.cloudflow.common.core.exception.ServiceException;

public final class OAuthFailure extends ServiceException {
    private final String error;

    public OAuthFailure(String error, String message, int status) {
        super(message, status);
        this.error = error;
    }

    public String getError() { return error; }

    public static OAuthFailure invalid(String message) {
        return new OAuthFailure("invalid_request", message, 400);
    }

    public static OAuthFailure unauthenticated() {
        return new OAuthFailure("invalid_token", "第三方授权已失效，请重新授权", 401);
    }

    public static OAuthFailure invalidGrant() {
        return new OAuthFailure("invalid_grant", "授权凭据无效、已使用或已过期", 400);
    }

    public static OAuthFailure forbidden() {
        return new OAuthFailure("insufficient_scope", "当前第三方授权不允许此项访问", 403);
    }
}

