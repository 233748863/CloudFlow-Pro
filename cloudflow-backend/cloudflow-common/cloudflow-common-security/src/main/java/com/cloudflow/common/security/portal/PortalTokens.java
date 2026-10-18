package com.cloudflow.common.security.portal;

import cn.dev33.satoken.config.SaTokenConfig;
import cn.dev33.satoken.session.SaSession;
import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.parameter.SaLoginParameter;
import java.security.SecureRandom;
import java.util.Base64;
import org.springframework.stereotype.Component;

@Component
public class PortalTokens {
    public static final String LOGIN_TYPE = "portal";
    public static final String HEADER = "portal-token";
    public static final String SESSION_KEY = "cloudflow:portalIdentity";
    public static final long ABSOLUTE_SECONDS = 28_800L;
    public static final long IDLE_SECONDS = 1_800L;
    private static final SecureRandom RANDOM = new SecureRandom();
    private final StpLogic logic;

    public PortalTokens() {
        logic = new StpLogic(LOGIN_TYPE).setConfig(new SaTokenConfig()
                .setTokenName(HEADER).setTimeout(ABSOLUTE_SECONDS).setActiveTimeout(IDLE_SECONDS)
                .setAutoRenew(false).setIsReadHeader(true).setIsReadBody(false).setIsReadCookie(false)
                .setIsWriteHeader(false).setIsConcurrent(true).setIsShare(false).setMaxLoginCount(10)
                .setIsLog(false).setIsPrint(false));
    }

    public StpLogic logic() { return logic; }

    public String create(PortalIdentity identity) {
        byte[] entropy = new byte[32];
        RANDOM.nextBytes(entropy);
        String rawToken = "p_" + Base64.getUrlEncoder().withoutPadding().encodeToString(entropy);
        String token = logic.createLoginSession(identity.portalUserId(), new SaLoginParameter()
                .setToken(rawToken).setTimeout(ABSOLUTE_SECONDS).setActiveTimeout(IDLE_SECONDS)
                .setIsConcurrent(true).setIsShare(false));
        logic.getTokenSessionByToken(token).set(SESSION_KEY, identity.snapshot());
        return token;
    }

    public PortalIdentity verify(String token) {
        if (token == null || !token.matches("p_[A-Za-z0-9_-]{43}")) return null;
        try {
            Object loginId = logic.getLoginIdByToken(token);
            if (loginId == null || logic.getTokenTimeout(token) <= 0) return null;
            logic.checkActiveTimeout(token);
            SaSession session = logic.getTokenSessionByToken(token, false);
            PortalIdentity identity = session == null ? null : PortalIdentity.from(session.get(SESSION_KEY));
            if (identity == null || !identity.portalUserId().toString().equals(String.valueOf(loginId))) return null;
            return identity;
        } catch (cn.dev33.satoken.exception.NotLoginException expired) {
            return null;
        }
    }

    public void touch(String token) { logic.updateLastActiveToNow(token); }

    public void end(String token) { logic.logoutByTokenValue(token); }

    public void endAccount(Long portalUserId) { logic.logout(portalUserId); }
}
