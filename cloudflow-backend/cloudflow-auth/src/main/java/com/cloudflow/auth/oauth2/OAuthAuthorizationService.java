package com.cloudflow.auth.oauth2;

import com.cloudflow.auth.mapper.OAuthMapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.annotation.HighRiskAction;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.security.oauth2.OAuthAccessPolicy;
import com.cloudflow.common.security.oauth2.OAuthDigests;
import com.cloudflow.common.security.oauth2.OAuthFailure;
import com.cloudflow.common.security.oauth2.OAuthScope;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class OAuthAuthorizationService {
    private final OAuthDatabase database;
    private final OAuthActors actors;
    private final OAuthJson json;
    private final OAuthRuntimeChecks checks;
    private final OAuthProperties properties;
    private final OAuthAccessPolicy policy;
    private final OAuthRateLimits limits;
    private final OAuthAudit audit;
    private final OAuthRevocations revocations;

    public AuthorizationView begin(OAuthProtocolRequests.Begin request) {
        policy.requireAvailable();
        OAuthActors.Actor actor = actors.current("system:oauth2:authorize");
        limits.authorize(actor.user().getTenantId(), actor.user().getUserId());
        try {
            if (request == null || !"code".equals(request.responseType())) throw new OAuthFailure("unsupported_response_type", "仅支持授权码模式", 400);
            if (!"S256".equals(request.codeChallengeMethod()) || !OAuthDigests.token(request.codeChallenge())
                    || request.state() != null && request.state().length() > 1024) throw OAuthFailure.invalid("必须提供有效的S256挑战和合法state");
            OAuthClient snapshot = database.read(mapper -> checks.active(mapper.clientByKey(request.clientId())));
            if (!Objects.equals(actor.user().getTenantId(), snapshot.getTenantId()) || !checks.grant(snapshot, "authorization_code")) throw OAuthFailure.forbidden();
            String redirect = OAuthClientRules.redirect(request.redirectUri(), properties.isAllowLoopbackHttp());
            if (!json.strings(snapshot.getRedirectUris()).contains(redirect)) throw OAuthFailure.invalid("回调地址与客户端登记值不一致");
            List<String> scopes = request.scope() == null ? checks.scopes(snapshot) : OAuthClientRules.scopes(request.scope());
            checks.allow(snapshot, scopes);
            actors.requireScopes(actor, scopes, false);
            String requestToken = OAuthDigests.random();
            return database.write(mapper -> {
                OAuthActors.Actor current = actors.lockCurrent(mapper, actor);
                OAuthClient client = checks.active(mapper.lockClient(snapshot.getClientId()));
                OAuthClientService.version(client, snapshot.getVersion());
                if (!current.permissions().contains("system:oauth2:authorize")) throw OAuthFailure.forbidden();
                actors.requireScopes(current, scopes, false);
                LocalDateTime now = LocalDateTime.now();
                OAuthCode row = new OAuthCode();
                row.setTenantId(client.getTenantId());
                row.setClientId(client.getClientId());
                row.setUserId(current.user().getUserId());
                row.setRequestHash(OAuthDigests.hash(requestToken));
                row.setSessionBindingHash(binding(actor));
                row.setRedirectUri(redirect);
                row.setRequestedScopes(json.write(scopes));
                row.setStateValue(request.state());
                row.setCodeChallenge(request.codeChallenge());
                row.setCodeChallengeMethod("S256");
                row.setClientVersion(client.getVersion());
                row.setStatus("PENDING");
                row.setExpiresTime(now.plusMinutes(5));
                row.setCreateBy(String.valueOf(current.user().getUserId()));
                row.setCreateTime(now);
                row.setUpdateBy(row.getCreateBy());
                row.setUpdateTime(now);
                if (mapper.insertCode(row) != 1) throw failed();
                OAuthApproval existing = mapper.approval(client.getTenantId(), client.getClientId(), row.getUserId());
                boolean automatic = checks.effective(existing, client) && json.strings(existing.getScopes()).containsAll(scopes)
                        && json.strings(client.getAutoApproveScopes()).containsAll(scopes);
                if (automatic) return issue(mapper, client, row, scopes, existing, false);
                audit.append(client.getTenantId(), row.getUserId(), "AUTHORIZATION_PENDING", "", "request=" + row.getCodeId(), false);
                return new AuthorizationView(client.getClientName(), client.getDescription(), scopes.stream().map(OAuthScope::require).map(OAuthScope::view).toList(),
                        requestToken, row.getExpiresTime(), null, false);
            });
        } catch (OAuthFailure failure) {
            audit.failure(actor.user().getTenantId(), actor.user().getUserId(), "AUTHORIZATION_FAILED", failure);
            throw failure;
        }
    }

    @Audit(name = "确认本人第三方授权")
    public AuthorizationView confirm(OAuthProtocolRequests.Consent request) {
        policy.requireAvailable();
        OAuthActors.Actor actor = actors.current("system:oauth2:authorize");
        limits.authorize(actor.user().getTenantId(), actor.user().getUserId());
        try {
            if (request == null || !OAuthDigests.token(request.getRequestToken()) || request.getApprove() == null) throw OAuthFailure.invalid("授权确认参数不完整");
            String requestHash = OAuthDigests.hash(request.getRequestToken());
            OAuthCode snapshot = database.read(mapper -> mapper.request(requestHash));
            if (snapshot == null || !Objects.equals(snapshot.getTenantId(), actor.user().getTenantId())
                    || !Objects.equals(snapshot.getUserId(), actor.user().getUserId())
                    || !OAuthDigests.matches(snapshot.getSessionBindingHash(), binding(actor))) throw OAuthFailure.forbidden();
            return database.write(mapper -> {
                OAuthActors.Actor current = actors.lockCurrent(mapper, actor);
                OAuthClient client = checks.active(mapper.lockClient(snapshot.getClientId()));
                OAuthCode row = mapper.lockRequest(client.getClientId(), requestHash);
                if (row == null || !"PENDING".equals(row.getStatus()) || !row.getExpiresTime().isAfter(LocalDateTime.now())
                        || !OAuthDigests.matches(row.getSessionBindingHash(), binding(actor))
                        || !Objects.equals(row.getClientVersion(), client.getVersion())) throw OAuthFailure.invalidGrant();
                OAuthClientRules.redirect(row.getRedirectUri(), properties.isAllowLoopbackHttp());
                if (!json.strings(client.getRedirectUris()).contains(row.getRedirectUri())) throw OAuthFailure.invalidGrant();
                if (!current.permissions().contains("system:oauth2:authorize")) throw OAuthFailure.forbidden();
                if (!request.getApprove()) {
                    row.setStatus("DENIED");
                    row.setApprovedScopes(json.write(List.of()));
                    row.setUpdateTime(LocalDateTime.now());
                    if (mapper.updateCode(row) != 1) throw failed();
                    audit.append(client.getTenantId(), row.getUserId(), "AUTHORIZATION_DENIED", "PENDING", "DENIED", false);
                    return new AuthorizationView(client.getClientName(), client.getDescription(), List.of(), null, row.getExpiresTime(),
                            redirect(row, "error", "access_denied"), false);
                }
                List<String> scopes = OAuthClientRules.scopes(request.getScopes());
                OAuthClientRules.subset(scopes, json.strings(row.getRequestedScopes()));
                checks.allow(client, scopes);
                actors.requireScopes(current, scopes, false);
                return issue(mapper, client, row, scopes, mapper.approval(client.getTenantId(), client.getClientId(), row.getUserId()), true);
            });
        } catch (OAuthFailure failure) {
            audit.failure(actor.user().getTenantId(), actor.user().getUserId(), "CONSENT_FAILED", failure);
            throw failure;
        }
    }

    public PageResult<OAuthViews.Grant> mine(int pageNum, int pageSize) {
        OAuthActors.Actor actor = actors.current("system:oauth2:grant:list");
        OAuthClientRules.page(pageNum, pageSize);
        return database.read(mapper -> new PageResult<>(mapper.approvals(actor.user().getTenantId(), actor.user().getUserId(),
                (long) (pageNum - 1) * pageSize, pageSize).stream().map(approval -> grantView(mapper, approval)).toList(),
                mapper.approvalCount(actor.user().getTenantId(), actor.user().getUserId()), pageNum, pageSize));
    }

    @HighRiskAction
    @Audit(name = "撤销本人第三方授权", highRisk = true)
    public void revoke(Long approveId, Integer expectedVersion) {
        OAuthActors.Actor actor = actors.current("system:oauth2:grant:revoke");
        OAuthApproval snapshot = database.read(mapper -> mapper.approvalById(actor.user().getTenantId(), actor.user().getUserId(), approveId));
        if (snapshot == null) throw OAuthFailure.forbidden();
        database.write(mapper -> {
            actors.lockCurrent(mapper, actor);
            OAuthClient client = mapper.lockClient(snapshot.getClientId());
            if (client == null) throw OAuthFailure.invalidGrant();
            OAuthApproval row = mapper.approval(client.getTenantId(), client.getClientId(), actor.user().getUserId());
            if (row == null || expectedVersion == null || !Objects.equals(row.getVersion(), expectedVersion)) {
                throw new OAuthFailure("conflict", "授权记录已变化，请刷新后确认", 409);
            }
            row.setRevokedTime(LocalDateTime.now());
            row.setUpdateTime(row.getRevokedTime());
            row.setUpdateBy(String.valueOf(actor.user().getUserId()));
            if (mapper.updateApproval(row) != 1) throw failed();
            revocations.invalidate(mapper, client.getTenantId(), client.getClientId(), actor.user().getUserId(), null, "CONSENT_REVOKED");
            audit.append(client.getTenantId(), actor.user().getUserId(), "CONSENT_REVOKED", "approval=" + row.getApproveId(), "REVOKED", true);
            return null;
        });
    }

    private AuthorizationView issue(OAuthMapper mapper, OAuthClient client, OAuthCode row, List<String> scopes, OAuthApproval existing, boolean explicit) {
        LocalDateTime now = LocalDateTime.now();
        if (explicit) {
            LinkedHashSet<String> combined = new LinkedHashSet<>();
            if (checks.effective(existing, client)) combined.addAll(json.strings(existing.getScopes()));
            combined.addAll(scopes);
            OAuthApproval approval = existing == null ? new OAuthApproval() : existing;
            approval.setTenantId(client.getTenantId());
            approval.setClientId(client.getClientId());
            approval.setUserId(row.getUserId());
            approval.setScopes(json.write(combined.stream().sorted().toList()));
            approval.setClientVersion(client.getVersion());
            approval.setApprovedTime(now);
            approval.setExpiresTime(now.plusSeconds(client.getRefreshTokenValiditySeconds()));
            approval.setRevokedTime(null);
            approval.setUpdateBy(String.valueOf(row.getUserId()));
            approval.setUpdateTime(now);
            if (existing == null) {
                approval.setVersion(0);
                approval.setCreateBy(approval.getUpdateBy());
                approval.setCreateTime(now);
                if (mapper.insertApproval(approval) != 1) throw failed();
            } else if (mapper.updateApproval(approval) != 1) throw failed();
        }
        String code = OAuthDigests.random();
        row.setApprovedScopes(json.write(scopes));
        row.setCodeHash(OAuthDigests.hash(code));
        row.setStatus("ISSUED");
        row.setExpiresTime(now.plusMinutes(2));
        row.setUpdateTime(now);
        if (mapper.updateCode(row) != 1) throw failed();
        audit.append(client.getTenantId(), row.getUserId(), explicit ? "CONSENT_APPROVED" : "CONSENT_REUSED", "PENDING", "ISSUED", false);
        return new AuthorizationView(client.getClientName(), client.getDescription(), scopes.stream().map(OAuthScope::require).map(OAuthScope::view).toList(),
                null, row.getExpiresTime(), redirect(row, "code", code), !explicit);
    }

    private OAuthViews.Grant grantView(OAuthMapper mapper, OAuthApproval row) {
        OAuthClient client = mapper.client(row.getClientId());
        String status = row.getRevokedTime() != null ? "REVOKED" : row.getExpiresTime().isAfter(LocalDateTime.now()) ? "ACTIVE" : "EXPIRED";
        if ("ACTIVE".equals(status) && (client == null || !"ACTIVE".equals(client.getStatus()) || !Objects.equals(client.getVersion(), row.getClientVersion()))) status = "POLICY_CHANGED";
        return new OAuthViews.Grant(row.getApproveId(), client == null ? "已停用应用" : client.getClientName(), json.strings(row.getScopes()),
                row.getApprovedTime(), row.getExpiresTime(), status, row.getVersion());
    }

    private static String binding(OAuthActors.Actor actor) {
        return OAuthDigests.hash("internal:" + actor.user().getTenantId() + ":" + actor.user().getUserId() + ":" + actor.internalToken());
    }

    private static String redirect(OAuthCode row, String key, String value) {
        return row.getRedirectUri() + (row.getRedirectUri().contains("?") ? "&" : "?") + key + "=" + encode(value)
                + (row.getStateValue() == null ? "" : "&state=" + encode(row.getStateValue()));
    }

    private static String encode(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }
    private static OAuthFailure failed() { return new OAuthFailure("server_error", "授权状态保存失败", 503); }

    @JsonSerialize(using = OAuthResponseSerializers.Authorization.class)
    public record AuthorizationView(String clientName, String description, List<OAuthScope.View> scopes, String requestToken,
            LocalDateTime expiresTime, String redirectUrl, boolean automatic) {
        @Override public String toString() { return "OAuthAuthorizationView[REDACTED]"; }
    }
}
