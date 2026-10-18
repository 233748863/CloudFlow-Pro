package com.cloudflow.auth.im;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.domain.SysUserTotp;
import com.cloudflow.auth.mapper.SysUserTotpMapper;
import com.cloudflow.auth.service.ISysUserBlacklistService;
import com.cloudflow.auth.service.LoginLockService;
import com.cloudflow.auth.service.PasswordService;
import com.cloudflow.auth.service.TotpService;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.annotation.HighRiskAction;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.servlet.http.HttpServletRequest;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class ImBindingIdentity {
    private final ImActors actors;
    private final ImDatabase database;
    private final SysUserTotpMapper totpAccounts;
    private final PasswordService passwords;
    private final TotpService totp;
    private final ISysUserBlacklistService blacklist;
    private final LoginLockService locks;
    private final ImLoginRequests requests;
    private final ImBindingProofs proofs;
    private final SysAuditLogMapper audits;

    public State status(ImBindingAction action) {
        Snapshot current = current(action);
        try {
            return new State(true, current.totpRequired(), proofs.read(current.identity()).proof().expiresAt());
        } catch (ImFailure failure) {
            if (!"IM_BINDING_VERIFICATION_REQUIRED".equals(failure.getReasonCode())) throw failure;
            return new State(false, current.totpRequired(), null);
        }
    }

    @HighRiskAction
    @Audit(name = "本人通信绑定身份验证", highRisk = true)
    public State authenticate(ImBindingAction action, Credentials credentials, HttpServletRequest request) {
        HttpServletRequest normalized = requests.begin(request, false);
        Snapshot before = current(action);
        requests.account(before.actor().tenantId(), before.actor().userId());
        if (credentials == null || credentials.password() == null || credentials.password().isBlank()
                || credentials.password().length() > 256
                || credentials.totpCode() != null && !credentials.totpCode().matches("[0-9]{6}")) throw ImFailure.bindingVerification();
        boolean matched;
        try { matched = passwords.matchesPassword(credentials.password(), before.password()).matched(); }
        catch (IllegalArgumentException failure) { matched = false; }
        if (!matched) throw rejected(before);
        if (before.totpRequired() && !totp.verifyLoginCode(before.actor().userId(), before.actor().tenantId(), credentials.totpCode())) {
            throw rejected(before);
        }
        Snapshot latest = current(action);
        same(before, latest);
        requests.recheck(normalized);
        database.write(latest.actor().tenantId(), mapper -> {
            if (action.management()) actors.verify(mapper, latest.actor(), action.permission(), true);
            else actors.verifySelf(mapper, latest.actor(), action.permission(), true);
            same(latest, current(action));
            audit(latest);
            return null;
        });
        ImBindingProofs.Ticket ticket = proofs.issue(latest.identity());
        same(latest, current(action));
        return new State(true, latest.totpRequired(), ticket.proof().expiresAt());
    }

    public Verification requireRecent(ImBindingAction action) {
        Snapshot snapshot = current(action);
        return new Verification(snapshot.actor(), snapshot.identity(), proofs.read(snapshot.identity()));
    }

    public void consume(Verification verification) {
        if (verification == null) throw ImFailure.bindingVerification();
        Snapshot current = current(verification.identity().action());
        if (!current.actor().equals(verification.actor()) || !current.identity().equals(verification.identity())) {
            throw ImFailure.bindingVerification();
        }
        proofs.consume(current.identity(), verification.ticket());
    }

    private Snapshot current(ImBindingAction action) {
        if (action == null) throw ImFailure.bindingVerification();
        ImActors.Actor actor = action.management() ? actors.management(action.permission()) : actors.self(action.permission());
        return database.read(actor.tenantId(), mapper -> {
            if (action.management()) actors.verify(mapper, actor, action.permission(), false);
            else actors.verifySelf(mapper, actor, action.permission(), false);
            SysUser user = mapper.loginUser(actor.tenantId(), actor.userId());
            if (user == null || !Objects.equals(user.getUserId(), actor.userId()) || !Objects.equals(user.getTenantId(), actor.tenantId())
                    || user.getVersion() == null || user.getVersion() < 0 || user.getVersion() == Integer.MAX_VALUE
                    || user.getPassword() == null || user.getPassword().isBlank() || user.getUserName() == null || user.getUserName().isBlank()
                    || blacklist.isBanned(actor.userId()) || locks.isLocked(user.getUserName(), actor.tenantId())) throw ImFailure.unauthenticated();
            List<SysUserTotp> records = totpAccounts.selectList(new LambdaQueryWrapper<SysUserTotp>()
                    .eq(SysUserTotp::getTenantId, actor.tenantId()).eq(SysUserTotp::getUserId, actor.userId()));
            if (records.size() > 1) throw ImFailure.bindingVerificationUnavailable();
            SysUserTotp record = records.isEmpty() ? null : records.get(0);
            if (record != null && (record.getId() == null || record.getId() <= 0
                    || !Integer.valueOf(0).equals(record.getEnabled()) && !Integer.valueOf(1).equals(record.getEnabled()))) {
                throw ImFailure.bindingVerificationUnavailable();
            }
            boolean required = record != null && Integer.valueOf(1).equals(record.getEnabled());
            String totpStamp = record == null ? "NONE" : record.getId() + ":" + record.getEnabled() + ":" + record.getSecretCiphertext();
            String stamp = ImLoginChallenges.digest(user.getPassword() + ":" + user.getVersion() + ":" + totpStamp);
            ImBindingProofs.Identity identity = new ImBindingProofs.Identity(actor.tenantId(), actor.userId(), user.getVersion(),
                    ImLoginChallenges.digest(actor.token()), stamp, action);
            return new Snapshot(actor, identity, user.getPassword(), user.getUserName(), required);
        });
    }

    private ImFailure rejected(Snapshot snapshot) {
        locks.recordFailure(snapshot.userName(), snapshot.actor().tenantId());
        return ImFailure.bindingVerification();
    }

    private void same(Snapshot expected, Snapshot actual) {
        if (!expected.actor().equals(actual.actor()) || !expected.identity().equals(actual.identity())) throw ImFailure.bindingVerification();
    }

    private void audit(Snapshot snapshot) {
        SysAuditLogEntity entry = new SysAuditLogEntity();
        entry.setTenantId(snapshot.actor().tenantId());
        entry.setBizModule("auth");
        entry.setAuditName("IM_BINDING_REAUTHENTICATION");
        entry.setAuditField(snapshot.identity().action().name());
        entry.setBeforeVal("VERIFICATION_REQUIRED");
        entry.setAfterVal("IDENTITY_VERIFIED");
        entry.setHighRisk(1);
        entry.setRiskLevel("HIGH");
        entry.setCreateBy(Long.toString(snapshot.actor().userId()));
        entry.setCreateTime(LocalDateTime.now());
        try { if (audits.insert(entry) != 1) throw ImFailure.audit(); }
        catch (RuntimeException failure) { throw ImFailure.audit(); }
    }

    public record Credentials(@JsonProperty(access = JsonProperty.Access.WRITE_ONLY) String password,
            @JsonProperty(access = JsonProperty.Access.WRITE_ONLY) String totpCode) {
        @Override public String toString() { return "ImBindingIdentity.Credentials[redacted]"; }
    }

    public record State(boolean verified, boolean totpRequired, Long expiresAt) { }

    public record Verification(ImActors.Actor actor, ImBindingProofs.Identity identity, ImBindingProofs.Ticket ticket) {
        @Override public String toString() { return "ImBindingIdentity.Verification[redacted]"; }
    }

    private record Snapshot(ImActors.Actor actor, ImBindingProofs.Identity identity, String password, String userName, boolean totpRequired) {
        @Override public String toString() { return "ImBindingIdentity.Snapshot[redacted]"; }
    }
}
