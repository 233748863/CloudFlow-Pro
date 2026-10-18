package com.cloudflow.auth.portal;

import com.cloudflow.auth.domain.SysPortalUser;
import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.mapper.SysPortalUserMapper;
import com.cloudflow.auth.service.ILoginLogService;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.security.portal.PortalClientAddress;
import com.cloudflow.common.security.portal.PortalContactSnapshot;
import com.cloudflow.common.security.portal.PortalIdentity;
import com.cloudflow.common.security.portal.PortalIdentityVerifier;
import com.cloudflow.common.security.portal.PortalRateLimits;
import com.cloudflow.common.security.portal.PortalTokens;
import com.cloudflow.common.tenant.TenantBroker;
import jakarta.servlet.http.HttpServletRequest;
import java.time.LocalDateTime;
import java.util.Locale;
import java.util.Objects;
import java.util.function.Supplier;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
@RequiredArgsConstructor
public class PortalAuthenticationService implements PortalIdentityVerifier {
    private final SysPortalUserMapper users;
    private final PortalContacts contacts;
    private final PortalCredentials credentials;
    private final PortalTenantAccess tenants;
    private final PortalTokens tokens;
    private final PortalRateLimits limits;
    private final ILoginLogService loginLogs;
    private final PlatformTransactionManager transactions;

    public LoginResponse login(String tenantCode, PortalRequests.Login request, HttpServletRequest http) {
        long started = System.nanoTime();
        String account = request.getLoginAccount().trim().toLowerCase(Locale.ROOT);
        limits.account(tenantCode.toLowerCase(Locale.ROOT), account);
        SysTenant tenant = tenants.byCode(tenantCode);
        String clientIp = PortalClientAddress.resolve(http.getRemoteAddr(), http.getHeader("X-Forwarded-For"));
        LoginOutcome outcome;
        if (tenant == null) {
            credentials.matches(request.getPassword(), null);
            outcome = new LoginOutcome(null, null, null);
        } else {
            outcome = asTransaction(tenant.getTenantId(), () -> attempt(account, request.getPassword(), clientIp));
        }
        if (outcome.revokeId() != null) tokens.endAccount(outcome.revokeId());
        if (outcome.identity() == null) {
            loginLogs.recordLoginFailure("portal-account:" + PortalCredentials.digest(account).substring(0, 32),
                    tenant == null ? null : tenant.getTenantId(), http, "门户凭据或账号状态无效", elapsed(started));
            throw new ServiceException("账号或密码错误，或账号暂不可用", 401);
        }
        String token = tokens.create(outcome.identity());
        loginLogs.recordLoginSuccess("portal:" + outcome.identity().portalUserId(), tenant.getTenantId(), http, elapsed(started));
        return new LoginResponse(token, PortalTokens.HEADER, PortalTokens.ABSOLUTE_SECONDS, PortalTokens.IDLE_SECONDS, outcome.session());
    }

    public void activate(String tenantCode, PortalRequests.Activation request) {
        SysTenant tenant = tenants.byCode(tenantCode);
        String hash = PortalCredentials.activationHash(request.getActivationToken());
        if (tenant == null || hash == null) throw invalidActivation();
        Long userId = asTransaction(tenant.getTenantId(), () -> {
            SysPortalUser user = users.lockActivation(tenant.getTenantId(), hash);
            if (!PortalAccountRules.canActivate(user, hash, LocalDateTime.now()) || contacts.current(user) == null) throw invalidActivation();
            String passwordHash = credentials.encode(request.getPassword(), user.getLoginAccount(), user.getEmail());
            if (!PortalAccountRules.canActivate(user, hash, LocalDateTime.now())) throw invalidActivation();
            user.setPasswordHash(passwordHash);
            user.setStatus("ACTIVE");
            user.setFailCount(0);
            user.setLockedUntil(null);
            user.setActivateConsumedTime(LocalDateTime.now());
            user.setSessionVersion(Math.addExact(user.getSessionVersion(), 1));
            write(user);
            return user.getPortalUserId();
        });
        tokens.endAccount(userId);
    }

    @Override
    public PortalIdentity verifyCurrent(PortalIdentity identity) {
        Verification result = asTransaction(identity.tenantId(), () -> {
            SysPortalUser user = users.lockId(identity.tenantId(), identity.portalUserId());
            if (!PortalAccountRules.accepts(user, identity)) return new Verification(null, false);
            PortalContactSnapshot contact = tenants.byId(identity.tenantId()) == null ? null : contacts.current(user);
            if (contact == null || !Objects.equals(contact.getVersion(), identity.contactVersion())) {
                user.setSessionVersion(Math.addExact(user.getSessionVersion(), 1));
                write(user);
                return new Verification(null, true);
            }
            return new Verification(identity, false);
        });
        if (result.revoked()) tokens.endAccount(identity.portalUserId());
        return result.identity();
    }

    public SessionView session(PortalIdentity identity) {
        return asTransaction(identity.tenantId(), () -> {
            SysPortalUser user = users.lockId(identity.tenantId(), identity.portalUserId());
            PortalContactSnapshot contact = PortalAccountRules.accepts(user, identity) ? contacts.current(user) : null;
            if (contact == null || !Objects.equals(contact.getVersion(), identity.contactVersion())) {
                throw new ServiceException("门户登录状态已失效，请重新登录", 401);
            }
            return new SessionView(user.getLoginAccount(), contact.getCustomerName(), contact.getContactName());
        });
    }

    private LoginOutcome attempt(String account, String password, String clientIp) {
        Long tenantId = com.cloudflow.common.core.context.UserContext.getTenantId();
        SysPortalUser user = users.lockAccount(tenantId, account);
        boolean matched = credentials.matches(password, user == null ? null : user.getPasswordHash());
        LocalDateTime now = LocalDateTime.now();
        if (!PortalAccountRules.canAttempt(user, now)) return new LoginOutcome(null, null, null);
        if (!matched) {
            int failures = PortalAccountRules.nextFailures(user, now);
            user.setFailCount(failures);
            boolean locked = failures >= PortalAccountRules.MAX_FAILURES;
            user.setStatus(locked ? "LOCKED" : "ACTIVE");
            user.setLockedUntil(locked ? now.plusMinutes(PortalAccountRules.LOCK_MINUTES) : null);
            if (locked) user.setSessionVersion(Math.addExact(user.getSessionVersion(), 1));
            write(user);
            return new LoginOutcome(null, null, locked ? user.getPortalUserId() : null);
        }
        PortalContactSnapshot contact = contacts.current(user);
        if (contact == null) {
            user.setSessionVersion(Math.addExact(user.getSessionVersion(), 1));
            write(user);
            return new LoginOutcome(null, null, user.getPortalUserId());
        }
        user.setStatus("ACTIVE");
        user.setFailCount(0);
        user.setLockedUntil(null);
        user.setLastLoginTime(now);
        user.setLastLoginIp(clientIp);
        write(user);
        PortalIdentity identity = new PortalIdentity(user.getPortalUserId(), user.getTenantId(), user.getCustomerId(), user.getRefBizId(),
                user.getSessionVersion(), contact.getVersion());
        return new LoginOutcome(identity, new SessionView(user.getLoginAccount(), contact.getCustomerName(), contact.getContactName()), null);
    }

    private void write(SysPortalUser user) {
        user.setUpdateBy("portal:" + user.getPortalUserId());
        user.setUpdateTime(LocalDateTime.now());
        if (users.writeState(user) != 1) throw new ServiceException("账号状态已变更，请重新核对", 409);
        user.setVersion(Math.addExact(user.getVersion(), 1));
    }

    private <Result> Result asTransaction(Long tenantId, Supplier<Result> action) {
        return TenantBroker.applyAs(tenantId, ignored -> new TransactionTemplate(transactions).execute(status -> action.get()));
    }

    private static ServiceException invalidActivation() { return new ServiceException("邀请无效或已过期，请联系邀请人员重新发送", 400); }
    private static long elapsed(long started) { return Math.max(0, (System.nanoTime() - started) / 1_000_000); }
    private record LoginOutcome(PortalIdentity identity, SessionView session, Long revokeId) { }
    private record Verification(PortalIdentity identity, boolean revoked) { }
    public record SessionView(String loginAccount, String customerName, String contactName) { }

    @Getter
    @RequiredArgsConstructor
    public static final class LoginResponse {
        private final String portalToken;
        private final String tokenHeader;
        private final long expiresIn;
        private final long idleSeconds;
        private final SessionView session;
    }
}
