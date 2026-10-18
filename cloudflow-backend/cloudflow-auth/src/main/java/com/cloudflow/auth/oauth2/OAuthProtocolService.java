package com.cloudflow.auth.oauth2;

import com.cloudflow.auth.mapper.OAuthMapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.annotation.HighRiskAction;
import com.cloudflow.common.security.oauth2.OAuthAccessPolicy;
import com.cloudflow.common.security.oauth2.OAuthDigests;
import com.cloudflow.common.security.oauth2.OAuthFailure;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class OAuthProtocolService {
    private final OAuthDatabase database;
    private final OAuthJson json;
    private final OAuthSecretCipher secrets;
    private final OAuthActors actors;
    private final OAuthRuntimeChecks checks;
    private final OAuthAccessPolicy policy;
    private final OAuthRateLimits limits;
    private final OAuthAudit audit;
    private final OAuthRevocations revocations;

    public TokenResponse token(OAuthProtocolRequests.Token request, String clientIp) {
        policy.requireAvailable();
        OAuthClient snapshot = null;
        try {
            limits.ip("token", clientIp);
            if (request == null || request.credentials() == null) throw OAuthProtocolRequests.invalidClient();
            limits.client("token", request.credentials().clientId(), clientIp);
            snapshot = authenticate(request.credentials(), true);
            OAuthClient authenticated = snapshot;
            Long userId = tokenUser(authenticated, request);
            Outcome outcome = database.write(mapper -> {
                if (userId != null && mapper.lockUser(authenticated.getTenantId(), userId) == null) throw OAuthFailure.unauthenticated();
                OAuthClient client = checks.active(mapper.lockClient(authenticated.getClientId()));
                OAuthClientService.version(client, authenticated.getVersion());
                if (request.grantType() == null) throw new OAuthFailure("unsupported_grant_type", "请指定已登记的授权模式", 400);
                return switch (request.grantType()) {
                    case "authorization_code" -> authorizationCode(mapper, client, request);
                    case "client_credentials" -> clientCredentials(mapper, client, request);
                    case "refresh_token" -> refresh(mapper, client, request);
                    default -> throw new OAuthFailure("unsupported_grant_type", "不支持此授权模式", 400);
                };
            });
            if (outcome.failure() != null) throw outcome.failure();
            return outcome.response();
        } catch (OAuthFailure failure) {
            audit.failure(snapshot == null ? null : snapshot.getTenantId(), null, "TOKEN_FAILED", failure);
            throw failure;
        }
    }

    @HighRiskAction
    @Audit(name = "客户端撤销第三方令牌", highRisk = true)
    public void revoke(OAuthProtocolRequests.Revocation request, String clientIp) {
        policy.requireAvailable();
        OAuthClient snapshot = null;
        try {
            limits.ip("revoke", clientIp);
            if (request == null || request.credentials() == null) throw OAuthProtocolRequests.invalidClient();
            limits.client("revoke", request.credentials().clientId(), clientIp);
            snapshot = authenticate(request.credentials(), false);
            OAuthClient authenticated = snapshot;
            database.write(mapper -> {
                OAuthClient client = mapper.lockClient(authenticated.getClientId());
                OAuthClientService.version(client, authenticated.getVersion());
                if (OAuthDigests.token(request.token())) {
                    String hash = OAuthDigests.hash(request.token());
                    OAuthAccessToken access = mapper.access(hash);
                    if (access != null && Objects.equals(access.getClientId(), client.getClientId()) && Objects.equals(access.getTenantId(), client.getTenantId())) {
                        mapper.revokeAccessHash(client.getTenantId(), client.getClientId(), hash, LocalDateTime.now());
                        revocations.endAfterCommit(List.of(hash));
                    }
                    OAuthRefreshToken refresh = mapper.refresh(hash);
                    if (refresh != null && Objects.equals(refresh.getClientId(), client.getClientId()) && Objects.equals(refresh.getTenantId(), client.getTenantId())) {
                        revocations.invalidate(mapper, client.getTenantId(), client.getClientId(), refresh.getUserId(), refresh.getFamilyId(), "CLIENT_REVOCATION");
                    }
                }
                audit.append(client.getTenantId(), null, "TOKEN_REVOCATION", "REQUESTED", "PROCESSED", true);
                return null;
            });
        } catch (OAuthFailure failure) {
            audit.failure(snapshot == null ? null : snapshot.getTenantId(), null, "REVOCATION_FAILED", failure);
            throw failure;
        }
    }

    private OAuthClient authenticate(OAuthProtocolRequests.Credentials credentials, boolean active) {
        if (credentials == null) throw OAuthProtocolRequests.invalidClient();
        OAuthClient client = database.read(mapper -> mapper.clientByKey(credentials.clientId()));
        if (client == null || active && !"ACTIVE".equals(client.getStatus())) throw OAuthProtocolRequests.invalidClient();
        if ("CONFIDENTIAL".equals(client.getClientType())) {
            if (!credentials.basic() || !secrets.matches(credentials.clientSecret(), client.getClientSecretEncrypted())) throw OAuthProtocolRequests.invalidClient();
        } else if (!"PUBLIC".equals(client.getClientType()) || credentials.basic() || credentials.clientSecret() != null) {
            throw OAuthProtocolRequests.invalidClient();
        }
        return client;
    }

    private Long tokenUser(OAuthClient client, OAuthProtocolRequests.Token request) {
        if ("authorization_code".equals(request.grantType())) {
            if (!OAuthDigests.token(request.code())) throw OAuthFailure.invalidGrant();
            OAuthCode code = database.read(mapper -> mapper.code(client.getClientId(), OAuthDigests.hash(request.code())));
            if (code == null || !Objects.equals(code.getTenantId(), client.getTenantId())) throw OAuthFailure.invalidGrant();
            return code.getUserId();
        }
        if ("refresh_token".equals(request.grantType())) {
            if (!OAuthDigests.token(request.refreshToken())) throw OAuthFailure.invalidGrant();
            OAuthRefreshToken token = database.read(mapper -> mapper.refresh(OAuthDigests.hash(request.refreshToken())));
            if (token == null || !Objects.equals(token.getClientId(), client.getClientId())
                    || !Objects.equals(token.getTenantId(), client.getTenantId())) throw OAuthFailure.invalidGrant();
            return token.getUserId();
        }
        return "client_credentials".equals(request.grantType()) ? client.getServiceUserId() : null;
    }

    private Outcome authorizationCode(OAuthMapper mapper, OAuthClient client, OAuthProtocolRequests.Token request) {
        if (!checks.grant(client, "authorization_code") || request.refreshToken() != null || !OAuthDigests.token(request.code())
                || request.redirectUri() == null || request.verifier() == null) throw OAuthFailure.invalidGrant();
        OAuthCode code = mapper.lockCode(client.getClientId(), OAuthDigests.hash(request.code()));
        if (code == null || !Objects.equals(code.getTenantId(), client.getTenantId())) throw OAuthFailure.invalidGrant();
        if (!code.getRedirectUri().equals(request.redirectUri()) || !"S256".equals(code.getCodeChallengeMethod())
                || !OAuthDigests.matches(code.getCodeChallenge(), OAuthDigests.challenge(request.verifier()))) throw OAuthFailure.invalidGrant();
        if ("USED".equals(code.getStatus())) {
            revocations.invalidate(mapper, client.getTenantId(), client.getClientId(), code.getUserId(), code.getRequestHash(), "CODE_REPLAY");
            return new Outcome(null, OAuthFailure.invalidGrant());
        }
        if (!"ISSUED".equals(code.getStatus()) || !code.getExpiresTime().isAfter(LocalDateTime.now())
                || !Objects.equals(client.getVersion(), code.getClientVersion()) || !code.getRedirectUri().equals(request.redirectUri())
                || !"S256".equals(code.getCodeChallengeMethod()) || !OAuthDigests.matches(code.getCodeChallenge(), OAuthDigests.challenge(request.verifier()))) {
            throw OAuthFailure.invalidGrant();
        }
        List<String> scopes = requested(request.scope(), json.strings(code.getApprovedScopes()));
        checks.allow(client, scopes);
        OAuthActors.Actor actor = actors.load(mapper, client.getTenantId(), code.getUserId());
        if (!actor.permissions().contains("system:oauth2:authorize")) throw OAuthFailure.forbidden();
        actors.requireScopes(actor, scopes, false);
        OAuthApproval approval = checks.approved(mapper, client, code.getUserId(), scopes);
        code.setStatus("USED");
        code.setConsumedTime(LocalDateTime.now());
        code.setUpdateTime(code.getConsumedTime());
        if (mapper.updateCode(code) != 1) throw OAuthFailure.invalidGrant();
        TokenResponse response = issue(mapper, client, actor, scopes, "authorization_code", code.getRequestHash(), null, approval.getExpiresTime());
        return new Outcome(response, null);
    }

    private Outcome clientCredentials(OAuthMapper mapper, OAuthClient client, OAuthProtocolRequests.Token request) {
        if (!"CONFIDENTIAL".equals(client.getClientType()) || !checks.grant(client, "client_credentials")
                || client.getServiceUserId() == null || request.code() != null || request.verifier() != null
                || request.refreshToken() != null || request.redirectUri() != null) {
            throw new OAuthFailure("unauthorized_client", "客户端不允许凭据模式或参数混用", 400);
        }
        List<String> defaults = checks.scopes(client).stream().filter(scope -> !"profile".equals(scope)).toList();
        List<String> scopes = requested(request.scope(), defaults);
        if (scopes.isEmpty()) throw new OAuthFailure("invalid_scope", "服务账号至少需要一项只读业务范围", 400);
        checks.allow(client, scopes);
        OAuthActors.Actor actor = actors.load(mapper, client.getTenantId(), client.getServiceUserId());
        actors.serviceAccount(actor);
        actors.requireScopes(actor, scopes, true);
        return new Outcome(issue(mapper, client, actor, scopes, "client_credentials", null, null, null), null);
    }

    private Outcome refresh(OAuthMapper mapper, OAuthClient client, OAuthProtocolRequests.Token request) {
        if (!checks.grant(client, "authorization_code") || !OAuthDigests.token(request.refreshToken())
                || request.code() != null || request.verifier() != null || request.redirectUri() != null) throw OAuthFailure.invalidGrant();
        OAuthRefreshToken previous = mapper.lockRefresh(client.getClientId(), OAuthDigests.hash(request.refreshToken()));
        if (previous == null || !Objects.equals(previous.getTenantId(), client.getTenantId())) throw OAuthFailure.invalidGrant();
        if ("USED".equals(previous.getStatus()) || "REVOKED".equals(previous.getStatus())) {
            revocations.invalidate(mapper, client.getTenantId(), client.getClientId(), previous.getUserId(), previous.getFamilyId(), "REFRESH_REPLAY");
            return new Outcome(null, OAuthFailure.invalidGrant());
        }
        if (!"ACTIVE".equals(previous.getStatus()) || previous.getRevokedTime() != null
                || !previous.getExpiresTime().isAfter(LocalDateTime.now()) || !Objects.equals(previous.getClientVersion(), client.getVersion())) {
            throw OAuthFailure.invalidGrant();
        }
        List<String> scopes = requested(request.scope(), json.strings(previous.getScopes()));
        checks.allow(client, scopes);
        OAuthActors.Actor actor = actors.load(mapper, client.getTenantId(), previous.getUserId());
        if (!actor.permissions().contains("system:oauth2:authorize")) throw OAuthFailure.forbidden();
        actors.requireScopes(actor, scopes, false);
        checks.approved(mapper, client, previous.getUserId(), scopes);
        previous.setStatus("USED");
        previous.setConsumedTime(LocalDateTime.now());
        previous.setUpdateTime(previous.getConsumedTime());
        TokenResponse response = issue(mapper, client, actor, scopes, "authorization_code", previous.getFamilyId(), previous, previous.getExpiresTime());
        if (mapper.updateRefresh(previous) != 1) throw OAuthFailure.invalidGrant();
        return new Outcome(response, null);
    }

    private TokenResponse issue(OAuthMapper mapper, OAuthClient client, OAuthActors.Actor actor, List<String> scopes, String grantType,
            String familyId, OAuthRefreshToken previous, LocalDateTime refreshExpires) {
        LocalDateTime now = LocalDateTime.now();
        String rawAccess = OAuthDigests.random();
        OAuthAccessToken access = new OAuthAccessToken();
        access.setTenantId(client.getTenantId());
        access.setClientId(client.getClientId());
        access.setUserId(actor.user().getUserId());
        access.setTokenHash(OAuthDigests.hash(rawAccess));
        access.setGrantType(grantType);
        access.setScopes(json.write(scopes));
        access.setClientVersion(client.getVersion());
        access.setRefreshFamilyId(familyId);
        access.setIssuedTime(now);
        access.setExpiresTime(now.plusSeconds(client.getAccessTokenValiditySeconds()));
        access.setCreateBy(String.valueOf(actor.user().getUserId()));
        access.setCreateTime(now);
        if (mapper.insertAccess(access) != 1) throw failed();
        String rawRefresh = null;
        if (familyId != null) {
            rawRefresh = OAuthDigests.random();
            OAuthRefreshToken refresh = new OAuthRefreshToken();
            refresh.setTenantId(client.getTenantId());
            refresh.setClientId(client.getClientId());
            refresh.setUserId(actor.user().getUserId());
            refresh.setTokenHash(OAuthDigests.hash(rawRefresh));
            refresh.setFamilyId(familyId);
            refresh.setScopes(json.write(scopes));
            refresh.setClientVersion(client.getVersion());
            refresh.setPreviousTokenId(previous == null ? null : previous.getRefreshTokenId());
            refresh.setStatus("ACTIVE");
            refresh.setIssuedTime(now);
            LocalDateTime maximum = now.plusSeconds(client.getRefreshTokenValiditySeconds());
            refresh.setExpiresTime(refreshExpires == null || maximum.isBefore(refreshExpires) ? maximum : refreshExpires);
            refresh.setCreateBy(access.getCreateBy());
            refresh.setCreateTime(now);
            refresh.setUpdateBy(access.getCreateBy());
            refresh.setUpdateTime(now);
            if (mapper.insertRefresh(refresh) != 1) throw failed();
            if (previous != null) previous.setReplacedById(refresh.getRefreshTokenId());
        }
        audit.append(client.getTenantId(), actor.user().getUserId(), previous == null ? "TOKEN_ISSUED" : "TOKEN_ROTATED", "",
                "access=" + access.getAccessTokenId() + ";grant=" + grantType + ";scope=" + String.join(" ", scopes), false);
        return new TokenResponse(rawAccess, "Bearer", client.getAccessTokenValiditySeconds(), rawRefresh, String.join(" ", scopes));
    }

    private static List<String> requested(String requested, List<String> allowed) {
        List<String> selected = requested == null ? List.copyOf(allowed) : OAuthClientRules.scopes(requested);
        OAuthClientRules.subset(selected, allowed);
        return selected;
    }

    private static OAuthFailure failed() { return new OAuthFailure("server_error", "令牌状态保存失败", 503); }

    private record Outcome(TokenResponse response, OAuthFailure failure) { }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    @JsonSerialize(using = OAuthResponseSerializers.Token.class)
    public record TokenResponse(@JsonProperty("access_token") String accessToken,
            @JsonProperty("token_type") String tokenType, @JsonProperty("expires_in") int expiresIn,
            @JsonProperty("refresh_token") String refreshToken, String scope) {
        @Override public String toString() { return "OAuthTokenResponse[REDACTED]"; }
    }
}
