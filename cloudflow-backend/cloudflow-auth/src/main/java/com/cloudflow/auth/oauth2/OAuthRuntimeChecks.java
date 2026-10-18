package com.cloudflow.auth.oauth2;

import com.cloudflow.auth.mapper.OAuthMapper;
import com.cloudflow.common.security.oauth2.OAuthFailure;
import com.cloudflow.common.security.oauth2.OAuthScope;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class OAuthRuntimeChecks {
    private final OAuthJson json;
    private final OAuthProperties properties;

    public OAuthClient active(OAuthClient client) {
        if (client == null || !"ACTIVE".equals(client.getStatus()) || !Integer.valueOf(0).equals(client.getDeleted())
                || client.getVersion() == null || client.getVersion() < 0) throw OAuthProtocolRequests.invalidClient();
        try {
            if (client.getTenantId() == null || client.getTenantId() <= 0 || client.getClientType() == null
                    || !Set.of("PUBLIC", "CONFIDENTIAL").contains(client.getClientType())
                    || client.getAccessTokenValiditySeconds() == null || client.getAccessTokenValiditySeconds() < 60
                    || client.getAccessTokenValiditySeconds() > 3600 || client.getRefreshTokenValiditySeconds() == null
                    || client.getRefreshTokenValiditySeconds() < 3600 || client.getRefreshTokenValiditySeconds() > 2592000) throw malformed();
            List<String> grants = OAuthClientRules.distinct(json.strings(client.getGrantTypes()), 2, true);
            if (!Set.of("authorization_code", "client_credentials").containsAll(grants)
                    || "PUBLIC".equals(client.getClientType()) && grants.contains("client_credentials")) throw malformed();
            List<String> allowed = scopes(client);
            List<String> automatic = OAuthClientRules.distinct(json.strings(client.getAutoApproveScopes()), 4, false);
            OAuthClientRules.subset(automatic, allowed);
            List<String> redirects = OAuthClientRules.distinct(json.strings(client.getRedirectUris()), 20, grants.contains("authorization_code"));
            redirects.forEach(value -> OAuthClientRules.redirect(value, properties.isAllowLoopbackHttp()));
            if (!grants.contains("authorization_code") && (!redirects.isEmpty() || !automatic.isEmpty() || allowed.contains("profile"))
                    || grants.contains("client_credentials") && client.getServiceUserId() == null
                    || !grants.contains("client_credentials") && client.getServiceUserId() != null) throw malformed();
        } catch (OAuthFailure invalid) { throw malformed(); }
        return client;
    }

    private static OAuthFailure malformed() { return new OAuthFailure("server_error", "客户端配置无效，请联系管理员", 503); }

    public List<String> scopes(OAuthClient client) {
        List<String> scopes = OAuthClientRules.scopes(json.strings(client.getScopes()));
        if (!Set.copyOf(scopes.stream().map(OAuthScope::require).map(OAuthScope::authority).toList()).equals(Set.copyOf(json.strings(client.getAuthorities())))
                || !Set.copyOf(scopes.stream().map(OAuthScope::require).map(OAuthScope::resource).toList()).equals(Set.copyOf(json.strings(client.getResourceIds())))) {
            throw new OAuthFailure("server_error", "客户端资源配置无效", 503);
        }
        return scopes;
    }

    public void allow(OAuthClient client, List<String> scopes) {
        OAuthClientRules.subset(scopes, scopes(client));
    }

    public OAuthApproval approved(OAuthMapper mapper, OAuthClient client, Long userId, List<String> scopes) {
        OAuthApproval approval = mapper.approval(client.getTenantId(), client.getClientId(), userId);
        if (!effective(approval, client) || !json.strings(approval.getScopes()).containsAll(scopes)) throw OAuthFailure.invalidGrant();
        return approval;
    }

    public boolean effective(OAuthApproval approval, OAuthClient client) {
        return approval != null && approval.getRevokedTime() == null && approval.getExpiresTime() != null
                && approval.getExpiresTime().isAfter(LocalDateTime.now()) && Objects.equals(approval.getClientVersion(), client.getVersion());
    }

    public boolean grant(OAuthClient client, String grant) { return json.strings(client.getGrantTypes()).contains(grant); }
}
