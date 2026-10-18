package com.cloudflow.auth.im;

import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.domain.vo.DynamicMapVO;
import com.cloudflow.auth.service.ILegalAgreementService;
import com.cloudflow.auth.service.LoginCompletionService;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.security.cookie.AuthCookieSupport;
import com.cloudflow.common.security.core.TokenService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicReference;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ImLoginFlow {
    private final ImLoginAccounts accounts;
    private final ImLoginAuthorization authorization;
    private final ImLoginChallenges challenges;
    private final ImLoginMfaChallenges mfaChallenges;
    private final ImLoginMfa mfa;
    private final ImLoginRedirects redirects;
    private final ImLoginRequests requests;
    private final ImIdentityProvider identity;
    private final ImDatabase database;
    private final ILegalAgreementService legal;
    private final LoginCompletionService completion;
    private final TokenService tokens;
    private final SysAuditLogMapper audits;

    public Availability availability(String tenantCode, HttpServletRequest request) {
        try {
            requests.begin(request, false);
            accounts.configuration(tenantCode);
            redirects.defaultPath();
            return new Availability(true, null, "企业微信登录可用");
        } catch (ImFailure failure) { return new Availability(false, failure.getReasonCode(), failure.getMessage()); }
        catch (RuntimeException failure) { return new Availability(false, "IM_LOGIN_CHALLENGE_UNAVAILABLE", "企业微信登录暂不可用，请使用原账号登录"); }
    }

    public ImLoginAuthorization.Grant begin(String tenantCode, ImLoginChallenges.Purpose purpose, String redirectPath,
            String legalReleaseCode, HttpServletRequest request, HttpServletResponse response) {
        HttpServletRequest verified = requests.begin(request, false);
        if (purpose == null || purpose == ImLoginChallenges.Purpose.BIND) throw ImFailure.loginChallenge();
        WeComCredentials credentials = accounts.configuration(tenantCode);
        ImLoginChallenges.Context context = new ImLoginChallenges.Context(credentials.tenantId(), credentials.configId(), credentials.version(),
                credentials.corpId(), credentials.agentId(), redirects.callbackUrl(), redirectPath, purpose, legalReleaseCode, null, null, null);
        database.read(credentials.tenantId(), mapper -> {
            SysTenant tenant = mapper.tenant(credentials.tenantId());
            legal.assertCurrentReleaseAccepted(tenant, legalReleaseCode);
            return null;
        });
        return authorization.begin(credentials, context, ImLoginBrowser.begin(verified, response));
    }

    public Result callback(String state, String code, HttpServletRequest request, HttpServletResponse response) {
        HttpServletRequest verified = requests.begin(request, true);
        String browser = ImLoginBrowser.require(verified);
        ImLoginChallenges.Context context = challenges.consumeLogin(state, browser);
        WeComCredentials credentials = accounts.configuration(context);
        ImIdentityProvider.Member member = identity.identify(credentials, code);
        ImLoginAccounts.Account account = accounts.identify(context, member);
        requests.account(account);
        return complete(new ImLoginMfaChallenges.Proof(context, account, System.currentTimeMillis()), browser, null, false, verified, response);
    }

    public Result verify(String challenge, String code, HttpServletRequest request, HttpServletResponse response) {
        HttpServletRequest verified = requests.begin(request, false);
        String browser = ImLoginBrowser.require(verified);
        ImLoginMfaChallenges.Proof proof = mfaChallenges.consume(challenge, browser);
        requests.account(proof.account());
        return complete(proof, browser, code, true, verified, response);
    }

    public void cancel(Result result, HttpServletRequest request, HttpServletResponse response) {
        if (result == null || result.token() == null) return;
        try { tokens.deleteToken(result.token()); }
        finally { AuthCookieSupport.clearAuthCookies(request, response); }
    }

    private Result complete(ImLoginMfaChallenges.Proof proof, String browser, String code, boolean submitted,
            HttpServletRequest request, HttpServletResponse response) {
        AtomicReference<String> issued = new AtomicReference<>();
        try {
            Result result = accounts.locked(proof.account(), (user, tenant) -> {
                requests.recheck(request);
                redirects.verify(proof.context().callbackUrl(), proof.context().redirectPath());
                legal.assertCurrentReleaseAccepted(tenant, proof.context().legalReleaseCode());
                if (!submitted && mfa.required(proof.account())) {
                    return new Result(true, mfa.issue(proof, browser), null, proof.context().redirectPath(), false);
                }
                if (submitted) mfa.verify(proof, code, request);
                audit(user, proof, submitted);
                R<DynamicMapVO> signed = completion.completeDetachedLogin(user, tenant, proof.context().legalReleaseCode(), request, proof.startedAt());
                if (signed == null || !signed.isSuccess() || signed.getData() == null
                        || !(signed.getData().values().get("token") instanceof String token) || token.isBlank()) throw ImFailure.loginAccount();
                issued.set(token);
                return new Result(false, null, token, proof.context().redirectPath(), Boolean.TRUE.equals(signed.getData().values().get("forcePasswordChange")));
            });
            if (result.requiresTotp()) {
                ImLoginBrowser.begin(request, response);
            } else {
                if (tokens.getLoginUserByToken(result.token()) == null) throw ImFailure.loginAccount();
                accounts.recheck(proof.account());
                AuthCookieSupport.addAuthCookies(request, response, result.token(), tokens.getExpirationSeconds());
            }
            return result;
        } catch (RuntimeException failure) {
            if (issued.get() != null) tokens.deleteToken(issued.get());
            throw failure;
        }
    }

    private void audit(SysUser user, ImLoginMfaChallenges.Proof proof, boolean verifiedTotp) {
        SysAuditLogEntity entry = new SysAuditLogEntity();
        entry.setTenantId(user.getTenantId());
        entry.setBizModule("system");
        entry.setAuditName("IM_LOGIN_SUCCESS");
        entry.setAuditField("im_config:" + proof.account().configId());
        entry.setAfterVal("purpose=" + proof.context().purpose() + ";mapping=" + proof.account().mappingId()
                + ";configVersion=" + proof.account().configVersion() + ";mappingVersion=" + proof.account().mappingVersion()
                + ";userVersion=" + proof.account().userVersion() + ";totp=" + verifiedTotp);
        entry.setHighRisk(0);
        entry.setRiskLevel("LOW");
        entry.setCreateBy(user.getUserName());
        entry.setCreateTime(LocalDateTime.now());
        try { if (audits.insert(entry) != 1) throw ImFailure.audit(); }
        catch (RuntimeException failure) { throw ImFailure.audit(); }
    }

    public record Result(boolean requiresTotp, String challenge, String token, String redirectPath, boolean forcePasswordChange) {
        @Override public String toString() { return "ImLoginFlow.Result[requiresTotp=" + requiresTotp + "]"; }
    }

    public record Availability(boolean enabled, String reasonCode, String message) { }
}
