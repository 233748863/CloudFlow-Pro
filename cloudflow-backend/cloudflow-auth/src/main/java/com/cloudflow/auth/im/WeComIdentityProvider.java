package com.cloudflow.auth.im;

import me.chanjar.weixin.common.error.WxErrorException;
import me.chanjar.weixin.cp.bean.WxCpOauth2UserInfo;
import org.springframework.stereotype.Component;

@Component
public class WeComIdentityProvider implements ImIdentityProvider {
    private final ImProperties properties;
    private final ImAccessTokens tokens;
    private final WeComHttp http = new WeComHttp();

    public WeComIdentityProvider(ImProperties properties, ImAccessTokens tokens) {
        this.properties = properties;
        this.tokens = tokens;
    }

    @Override
    public String providerType() { return "WECOM"; }

    @Override
    public Member identify(WeComCredentials credentials, String code) {
        if (!properties.isEnabled()) throw ImFailure.disabled();
        if (code == null || !code.matches("[A-Za-z0-9_-]{1,512}")) throw ImFailure.configuration();
        WeComSdk sdk = new WeComSdk(credentials, http, () -> tokens.resolve(credentials,
                () -> WeComSdk.fetchToken(credentials, http)),
                rejected -> tokens.discard(credentials, rejected));
        return identify(sdk, credentials, code);
    }

    static Member identify(WeComSdk sdk, WeComCredentials credentials, String code) {
        try {
            WxCpOauth2UserInfo identity = sdk.getOauth2Service().getUserInfo(code);
            String userId = identity.getUserId();
            if (userId == null || userId.isBlank() || userId.length() > 128
                    || userId.chars().anyMatch(Character::isISOControl)
                    || identity.getExternalUserId() != null) throw ImFailure.remote();
            return new Member(credentials.tenantId(), credentials.configId(), credentials.version(), credentials.corpId(), userId);
        } catch (ImFailure failure) {
            throw failure;
        } catch (WxErrorException | RuntimeException failure) {
            throw ImFailure.remote();
        }
    }
}
