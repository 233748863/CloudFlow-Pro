package com.cloudflow.auth.oauth2;

import com.cloudflow.common.security.oauth2.OAuthAccessPolicy;
import com.cloudflow.common.security.oauth2.OAuthFailure;
import com.cloudflow.common.security.oauth2.OAuthIdentity;
import com.cloudflow.common.security.oauth2.OAuthIdentityVerifier;
import com.cloudflow.common.security.oauth2.OAuthScope;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class OAuthAccessService implements OAuthIdentityVerifier {
    private final OAuthDatabase database;
    private final OAuthActors actors;
    private final OAuthJson json;
    private final OAuthRuntimeChecks checks;
    private final OAuthAccessPolicy policy;
    private final OAuthRateLimits limits;
    private final OAuthAudit audit;

    @Override
    public OAuthIdentity verifyHash(String tokenHash) {
        policy.requireAvailable();
        if (tokenHash == null || !tokenHash.matches("[0-9a-f]{64}")) throw OAuthFailure.unauthenticated();
        return database.read(mapper -> {
            OAuthAccessToken token = mapper.access(tokenHash);
            if (token == null || token.getRevokedTime() != null || token.getExpiresTime() == null
                    || !token.getExpiresTime().isAfter(LocalDateTime.now())) throw OAuthFailure.unauthenticated();
            OAuthClient client = mapper.client(token.getClientId());
            if (client == null || !"ACTIVE".equals(client.getStatus()) || !Objects.equals(client.getTenantId(), token.getTenantId())
                    || !Objects.equals(client.getVersion(), token.getClientVersion())) throw OAuthFailure.unauthenticated();
            checks.active(client);
            List<String> scopes = OAuthClientRules.scopes(json.strings(token.getScopes()));
            checks.allow(client, scopes);
            OAuthActors.Actor actor = actors.load(mapper, client.getTenantId(), token.getUserId());
            boolean serviceAccount = "client_credentials".equals(token.getGrantType());
            if (serviceAccount) {
                if (!Objects.equals(client.getServiceUserId(), token.getUserId()) || !checks.grant(client, "client_credentials")) throw OAuthFailure.unauthenticated();
                actors.serviceAccount(actor);
            } else {
                if (!"authorization_code".equals(token.getGrantType()) || !checks.grant(client, "authorization_code")
                        || !actor.permissions().contains("system:oauth2:authorize")) throw OAuthFailure.unauthenticated();
                try { checks.approved(mapper, client, actor.user().getUserId(), scopes); }
                catch (OAuthFailure failure) {
                    if ("invalid_grant".equals(failure.getError())) throw OAuthFailure.unauthenticated();
                    throw failure;
                }
            }
            actors.requireScopes(actor, scopes, serviceAccount);
            Set<String> permissions = scopes.stream().map(OAuthScope::require).flatMap(scope -> scope.businessPermissions().stream()).collect(Collectors.toUnmodifiableSet());
            return new OAuthIdentity(token.getAccessTokenId(), token.getTenantId(), token.getClientId(), token.getUserId(), token.getTokenHash(),
                    token.getGrantType(), scopes, actor.user().getDeptId(), actor.dsType(), actor.deptIds(), permissions,
                    token.getExpiresTime().atZone(ZoneId.systemDefault()).toInstant().toEpochMilli());
        });
    }

    public Profile profile() {
        OAuthIdentity identity = com.cloudflow.common.security.oauth2.OAuthContext.require();
        com.cloudflow.common.security.oauth2.OAuthContext.requireScope("profile");
        if (!"authorization_code".equals(identity.grantType())) throw OAuthFailure.forbidden();
        limits.resource(identity.tokenHash());
        return database.read(mapper -> {
            OAuthActors.Actor actor = actors.load(mapper, identity.tenantId(), identity.userId());
            return new Profile(String.valueOf(actor.user().getUserId()), actor.user().getNickName());
        });
    }

    public Tenant tenant() {
        OAuthIdentity identity = com.cloudflow.common.security.oauth2.OAuthContext.require();
        com.cloudflow.common.security.oauth2.OAuthContext.requireScope("system.tenant.read");
        limits.resource(identity.tokenHash());
        return database.read(mapper -> {
            OAuthActors.Actor actor = actors.load(mapper, identity.tenantId(), identity.userId());
            return new Tenant(actor.tenant().getTenantId(), actor.tenant().getTenantName());
        });
    }

    @Override
    public void recordAccess(OAuthIdentity identity, int status) {
        database.write(ignored -> {
            audit.append(identity == null ? null : identity.tenantId(), identity == null ? null : identity.userId(),
                    "RESOURCE_ACCESS", identity == null ? "UNAUTHENTICATED" : "access=" + identity.accessId(), "status=" + status, status >= 400);
            return null;
        });
    }

    public record Profile(String sub, String name) { }
    public record Tenant(Long tenantId, String tenantName) { }
}
