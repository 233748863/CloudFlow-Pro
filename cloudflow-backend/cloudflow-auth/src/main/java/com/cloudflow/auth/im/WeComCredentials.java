package com.cloudflow.auth.im;

import com.fasterxml.jackson.annotation.JsonIgnore;
import java.util.Base64;
import me.chanjar.weixin.cp.config.impl.WxCpDefaultConfigImpl;

public record WeComCredentials(long tenantId, long configId, int version, String corpId, long agentId,
        @JsonIgnore String appSecret, @JsonIgnore String callbackToken, @JsonIgnore String aesKey) {

    public WeComCredentials {
        if (tenantId <= 0 || configId <= 0 || version < 0 || corpId == null || !corpId.matches("[A-Za-z0-9_-]{1,100}")
                || agentId <= 0 || appSecret == null || !appSecret.matches("[A-Za-z0-9_-]{1,1024}")) {
            throw ImFailure.configuration();
        }
        if (callbackToken != null && !callbackToken.matches("[A-Za-z0-9]{1,32}")) throw ImFailure.configuration();
        if (aesKey != null) {
            if (!aesKey.matches("[A-Za-z0-9+/]{43}")) throw ImFailure.configuration();
            byte[] decoded = Base64.getDecoder().decode(aesKey + "=");
            if (decoded.length != 32 || !Base64.getEncoder().withoutPadding().encodeToString(decoded).equals(aesKey)) {
                throw ImFailure.configuration();
            }
        }
    }

    public String cacheKey() {
        return "cloudflow:im:token:" + tenantId + ":" + configId + ":" + version;
    }

    WxCpDefaultConfigImpl sdkConfiguration() {
        WxCpDefaultConfigImpl configuration = new WxCpDefaultConfigImpl();
        configuration.setCorpId(corpId);
        configuration.setAgentId(agentId);
        configuration.setCorpSecret(appSecret);
        configuration.setToken(callbackToken);
        configuration.setAesKey(aesKey);
        return configuration;
    }

    void requireCallbackKeys() {
        if (callbackToken == null || aesKey == null) throw ImFailure.configuration();
    }

    @Override
    public String toString() {
        return "WeComCredentials[tenantId=" + tenantId + ", configId=" + configId + ", version=" + version + "]";
    }
}
