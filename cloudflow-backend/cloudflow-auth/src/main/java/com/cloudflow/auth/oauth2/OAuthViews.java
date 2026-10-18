package com.cloudflow.auth.oauth2;

import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.security.oauth2.OAuthScope;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import java.time.LocalDateTime;
import java.util.List;

public final class OAuthViews {
    private OAuthViews() { }

    public record Client(Long clientId, Long tenantId, String clientKey, String clientType, String clientName,
            Long logoFileId, String description, Long serviceUserId, boolean secretConfigured,
            int accessTokenValiditySeconds, int refreshTokenValiditySeconds, List<String> redirectUris,
            List<String> grantTypes, List<String> scopes, List<String> autoApproveScopes,
            List<String> authorities, List<String> resourceIds, String status, int version) { }

    public record Overview(boolean enabled, String message, List<OAuthScope.View> scopeRegistry, PageResult<Client> page) { }

    @JsonSerialize(using = OAuthResponseSerializers.Created.class)
    public record Created(Client client, @JsonProperty(access = JsonProperty.Access.READ_ONLY) String clientSecret) {
        @Override
        public String toString() { return "OAuthCreated[clientId=" + client.clientId() + "]"; }
    }

    public record Grant(Long approveId, String clientName, List<String> scopes, LocalDateTime approvedTime,
            LocalDateTime expiresTime, String status, int version) { }

    public record Version(Integer version) { }
}
