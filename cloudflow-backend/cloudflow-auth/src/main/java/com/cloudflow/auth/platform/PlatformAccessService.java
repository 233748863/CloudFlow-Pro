package com.cloudflow.auth.platform;

import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.domain.SysUserTotp;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.auth.mapper.SysUserTotpMapper;
import com.cloudflow.auth.service.PasswordService;
import com.cloudflow.auth.service.TotpService;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.annotation.HighRiskAction;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.security.core.TokenService;
import com.cloudflow.common.tenant.TenantBroker;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class PlatformAccessService {
    private static final Set<String> ENTRY_PERMISSIONS = Set.of("system:tenant-package:list",
            "system:data-source:list", "system:oauth2:client:list", "system:tenant:list");
    private static final Set<String> PLATFORM_PERMISSIONS = Set.of("system:tenant-package:list",
            "system:tenant-package:manage", "system:tenant-package:sync", "system:data-source:list",
            "system:data-source:manage", "system:data-source:test", "system:data-source:register",
            "system:oauth2:client:list", "system:oauth2:client:manage", "system:tenant:list",
            "system:tenant:query", "system:tenant:add", "system:tenant:edit", "system:tenant:remove",
            "system:tenant:switch");
    private final PlatformAccessProperties properties;
    private final SysUserMapper users;
    private final SysUserTotpMapper totpAccounts;
    private final TokenService tokens;
    private final PasswordService passwords;
    private final TotpService totp;
    private final PlatformAuthenticationStore proofs;
    private final SysAuditLogMapper audits;
    private final Clock clock;

    @Autowired
    public PlatformAccessService(PlatformAccessProperties properties, SysUserMapper users,
            SysUserTotpMapper totpAccounts, TokenService tokens, PasswordService passwords,
            TotpService totp, PlatformAuthenticationStore proofs, SysAuditLogMapper audits) {
        this(properties, users, totpAccounts, tokens, passwords, totp, proofs, audits, Clock.systemUTC());
    }

    PlatformAccessService(PlatformAccessProperties properties, SysUserMapper users,
            SysUserTotpMapper totpAccounts, TokenService tokens, PasswordService passwords,
            TotpService totp, PlatformAuthenticationStore proofs, SysAuditLogMapper audits, Clock clock) {
        this.properties = properties;
        this.users = users;
        this.totpAccounts = totpAccounts;
        this.tokens = tokens;
        this.passwords = passwords;
        this.totp = totp;
        this.proofs = proofs;
        this.audits = audits;
        this.clock = clock;
    }

    public AccessState status() {
        if (!properties.configured()) return new AccessState(false, false, false, null, "平台管理身份尚未配置，功能已停用");
        Actor actor = requireActor();
        requireEntryPermission(actor);
        PlatformAuthenticationProof proof = currentProof(actor);
        return state(actor, proof);
    }

    @HighRiskAction
    @Audit(name = "平台操作再次身份验证", highRisk = true)
    public AccessState authenticate(PlatformReauthenticationRequest request) {
        Actor actor = requireActor();
        requireEntryPermission(actor);
        proofs.clear(actor.token());
        if (request == null || request.getPassword() == null || request.getPassword().isBlank()
                || request.getPassword().length() > 256
                || request.getTotpCode() != null && !request.getTotpCode().matches("[0-9]{6}")) {
            throw rejected();
        }
        boolean passwordMatched;
        try {
            passwordMatched = passwords.matchesPassword(request.getPassword(), actor.user().getPassword()).matched();
        } catch (IllegalArgumentException failure) {
            throw rejected();
        }
        if (!passwordMatched) throw rejected();
        if (actor.totpRequired()) {
            boolean verified;
            try {
                verified = totp.verifyLoginCode(actor.user().getUserId(), actor.user().getTenantId(), request.getTotpCode());
            } catch (RuntimeException failure) {
                throw rejected();
            }
            if (!verified) throw rejected();
        }
        Actor latest = requireActor();
        requireEntryPermission(latest);
        if (!actor.sameIdentity(latest) || !actor.credentialStamp().equals(latest.credentialStamp())) throw rejected();
        long authenticatedAt = clock.millis();
        PlatformAuthenticationProof proof = new PlatformAuthenticationProof(latest.user().getUserId(),
                latest.user().getTenantId(), latest.credentialStamp(), authenticatedAt,
                Math.addExact(authenticatedAt, PlatformAuthenticationStore.VALIDITY_SECONDS * 1000));
        recordVerifiedIdentity(latest);
        proofs.write(latest.token(), proof);
        return state(latest, proof);
    }

    public Operator requireRecent(String permission) {
        if (!PLATFORM_PERMISSIONS.contains(permission)) throw new IllegalArgumentException("未登记的平台操作权限");
        Actor actor = requireActor();
        if (!StpUtil.getStpLogic().hasPermission(actor.user().getUserId(), permission)) {
            throw new ServiceException("当前账号无此平台操作权限", 403);
        }
        if (currentProof(actor) == null) throw new ServiceException("请重新验证身份后再执行平台操作", 403);
        return new Operator(actor.user().getUserId(), actor.user().getTenantId());
    }

    public Set<String> controlPermissions(Long userId, Long tenantId) {
        if (userId == null || tenantId == null || !properties.permits(userId, tenantId)) return Set.of();
        Actor actor;
        try { actor = requireActor(); }
        catch (ServiceException rejected) {
            if (Integer.valueOf(401).equals(rejected.getCode()) || Integer.valueOf(403).equals(rejected.getCode())) return Set.of();
            throw rejected;
        }
        if (!Objects.equals(userId, actor.user().getUserId()) || !Objects.equals(tenantId, actor.user().getTenantId())) return Set.of();
        return PLATFORM_PERMISSIONS.stream().filter(permission -> !"system:tenant:switch".equals(permission)).collect(java.util.stream.Collectors.toUnmodifiableSet());
    }

    private Actor requireActor() {
        if (!properties.configured()) throw new ServiceException("平台管理身份尚未配置，功能已停用", 503);
        String token = tokens.getCurrentTokenValue();
        Map<String, Object> login = tokens.getLoginUserByToken(token);
        if (login == null || token == null || token.isBlank()) throw new ServiceException("内部登录状态无效", 401);
        Long userId = positiveLong(login.get("userId"));
        Long tenantId = positiveLong(login.get("tenantId"));
        Long authenticatedUserId = positiveLong(StpUtil.getStpLogic().getLoginIdByToken(token));
        if (userId == null || tenantId == null || !userId.equals(authenticatedUserId)
                || !properties.permits(userId, tenantId)) throw identityRequired();
        SysUser user = TenantBroker.applyWithoutTenant(ignored -> users.selectById(userId));
        if (user == null || !userId.equals(user.getUserId()) || !tenantId.equals(user.getTenantId())
                || !"0".equals(user.getStatus()) || !Integer.valueOf(0).equals(user.getDeleted())
                || user.getVersion() == null || user.getPassword() == null) throw identityRequired();
        SysUserTotp challenge = TenantBroker.applyWithoutTenant(ignored -> totpAccounts.selectOne(
                new LambdaQueryWrapper<SysUserTotp>().eq(SysUserTotp::getUserId, userId)
                        .eq(SysUserTotp::getTenantId, tenantId)));
        boolean required = challenge != null && Integer.valueOf(1).equals(challenge.getEnabled());
        String challengeStamp = required ? String.valueOf(challenge.getSecretCiphertext()) : "DISABLED";
        String credentialStamp = PlatformAuthenticationStore.digest(user.getPassword() + ":" + user.getVersion()
                + ":" + required + ":" + challengeStamp);
        return new Actor(user, token, required, credentialStamp);
    }

    private void requireEntryPermission(Actor actor) {
        if (ENTRY_PERMISSIONS.stream().noneMatch(permission -> StpUtil.getStpLogic()
                .hasPermission(actor.user().getUserId(), permission))) {
            throw new ServiceException("当前账号无平台管理入口权限", 403);
        }
    }

    private PlatformAuthenticationProof currentProof(Actor actor) {
        PlatformAuthenticationProof proof = proofs.read(actor.token());
        if (proof == null) return null;
        long now = clock.millis();
        if (!Objects.equals(proof.userId(), actor.user().getUserId())
                || !Objects.equals(proof.tenantId(), actor.user().getTenantId())
                || !Objects.equals(proof.credentialStamp(), actor.credentialStamp())
                || proof.authenticatedAt() < 0 || proof.authenticatedAt() > now
                || proof.expiresAt() <= now || proof.expiresAt() - proof.authenticatedAt()
                        != PlatformAuthenticationStore.VALIDITY_SECONDS * 1000) {
            proofs.clear(actor.token());
            return null;
        }
        return proof;
    }

    private AccessState state(Actor actor, PlatformAuthenticationProof proof) {
        return new AccessState(true, proof != null, actor.totpRequired(), proof == null ? null : proof.expiresAt(),
                proof == null ? "请验证当前账号身份；验证通过后五分钟内有效" : "平台身份验证通过");
    }

    private void recordVerifiedIdentity(Actor actor) {
        SysAuditLogEntity entry = new SysAuditLogEntity();
        entry.setTenantId(actor.user().getTenantId());
        entry.setBizModule("auth");
        entry.setAuditName("PLATFORM_REAUTHENTICATION");
        entry.setAuditField("platform_identity");
        entry.setBeforeVal("REAUTHENTICATION_REQUIRED");
        entry.setAfterVal("IDENTITY_VERIFIED");
        entry.setHighRisk(1);
        entry.setRiskLevel("HIGH");
        entry.setCreateBy(String.valueOf(actor.user().getUserId()));
        entry.setCreateTime(LocalDateTime.ofInstant(clock.instant(), ZoneId.systemDefault()));
        int inserted;
        try { inserted = TenantBroker.applyAs(actor.user().getTenantId(), ignored -> audits.insert(entry)); }
        catch (RuntimeException failure) { throw new ServiceException("平台身份核验审计保存失败，请稍后重试", 503); }
        if (inserted != 1) throw new ServiceException("平台身份核验审计保存失败，请稍后重试", 503);
    }

    private static Long positiveLong(Object value) {
        if (value == null || !String.valueOf(value).matches("[1-9][0-9]{0,18}")) return null;
        try { return Long.valueOf(String.valueOf(value)); }
        catch (NumberFormatException failure) { return null; }
    }

    private static ServiceException identityRequired() {
        return new ServiceException("当前账号不具备平台管理身份", 403);
    }

    private static ServiceException rejected() {
        return new ServiceException("再次身份验证失败", 403);
    }

    public record AccessState(boolean configured, boolean verified, boolean totpRequired,
            Long verifiedUntil, String message) { }

    public record Operator(Long userId, Long tenantId) { }

    private record Actor(SysUser user, String token, boolean totpRequired, String credentialStamp) {
        boolean sameIdentity(Actor other) {
            return token.equals(other.token()) && Objects.equals(user.getUserId(), other.user().getUserId())
                    && Objects.equals(user.getTenantId(), other.user().getTenantId());
        }

        @Override
        public String toString() { return "PlatformActor[userId=" + user.getUserId() + "]"; }
    }
}
