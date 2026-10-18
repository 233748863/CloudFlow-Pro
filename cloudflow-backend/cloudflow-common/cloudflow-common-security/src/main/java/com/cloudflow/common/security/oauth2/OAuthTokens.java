package com.cloudflow.common.security.oauth2;

import cn.dev33.satoken.config.SaTokenConfig;
import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.parameter.SaLoginParameter;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class OAuthTokens {
    public static final String LOGIN_TYPE = "oauth2";
    private final StpLogic logic;

    public OAuthTokens() {
        logic = new StpLogic(LOGIN_TYPE).setConfig(new SaTokenConfig().setTokenName("oauth2-session")
                .setTimeout(3600).setActiveTimeout(-1).setAutoRenew(false).setIsReadHeader(false)
                .setIsReadBody(false).setIsReadCookie(false).setIsWriteHeader(false)
                .setIsConcurrent(true).setIsShare(false).setIsLog(false).setIsPrint(false));
    }

    public void project(OAuthIdentity identity) {
        long seconds = (identity.expiresAt() - System.currentTimeMillis()) / 1000;
        if (seconds <= 0) throw OAuthFailure.unauthenticated();
        String projection = projection(identity.tokenHash());
        Object existing = logic.getLoginIdByToken(projection);
        if (existing != null && !identity.accessId().toString().equals(String.valueOf(existing))) throw OAuthFailure.unauthenticated();
        if (existing == null || logic.getTokenTimeout(projection) <= 0) {
            logic.createLoginSession(identity.accessId(), new SaLoginParameter().setToken(projection)
                    .setTimeout(seconds).setActiveTimeout(-1).setIsConcurrent(true).setIsShare(false));
        }
    }

    public void bind(OAuthIdentity identity) {
        project(identity);
        logic.setTokenValueToStorage(projection(identity.tokenHash()));
    }

    public void end(List<String> hashes) {
        for (String hash : hashes) logic.logoutByTokenValue(projection(hash));
    }

    public StpLogic logic() { return logic; }

    private static String projection(String hash) {
        if (hash == null || !hash.matches("[0-9a-f]{64}")) throw OAuthFailure.unauthenticated();
        return "oauth2_projection_" + hash;
    }
}
