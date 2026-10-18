package com.cloudflow.auth.im;

import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.mapper.ImMapper;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.permission.TenantPermissionPolicy;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.function.Supplier;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ImBindingAccounts {
    private final ImActors actors;
    private final ImDatabase database;
    private final ImConfigRules rules;
    private final ImLoginRedirects redirects;
    private final TenantPermissionPolicy permissions;
    private final SysAuditLogMapper audits;

    public Overview overview() {
        Summary binding = mine();
        if (binding != null) {
            try {
                actors.self(ImBindingAction.UNBIND.permission());
                requireSelfUnbind(binding);
                return new Overview(binding, false, "IM_BINDING_CONFLICT", "当前账号已有绑定，请核对现有绑定", true, null);
            } catch (ImFailure failure) {
                if (!List.of("IM_BINDING_ADMIN_REQUIRED", "IM_PERMISSION_DENIED", "IM_BINDING_CHANGED").contains(failure.getReasonCode())) throw failure;
                return new Overview(binding, false, "IM_BINDING_CONFLICT", "当前账号已有绑定，请核对现有绑定", false, failure.getMessage());
            }
        }
        try {
            configuration(actors.self(ImBindingAction.BIND.permission()));
            return new Overview(null, true, null, null);
        } catch (ImFailure failure) {
            if (!List.of("IM_DISABLED", "IM_CONFIGURATION_INVALID", "IM_SECRET_UNAVAILABLE", "IM_BINDING_UNAVAILABLE", "IM_PERMISSION_DENIED")
                    .contains(failure.getReasonCode())) throw failure;
            return new Overview(null, false, failure.getReasonCode(), failure.getMessage());
        }
    }

    public Summary mine() {
        ImActors.Actor actor = actors.self("system:im:binding:mine");
        return database.read(actor.tenantId(), mapper -> {
            actors.verifySelf(mapper, actor, "system:im:binding:mine", false);
            List<ImBindingRow> rows = mapper.ownBindings(actor.tenantId(), actor.userId());
            if (rows.size() > 1) throw ImFailure.bindingConflict();
            return rows.isEmpty() ? null : view(rows.get(0), actor);
        });
    }

    public WeComCredentials configuration(ImActors.Actor actor) {
        return database.read(actor.tenantId(), mapper -> {
            actors.verifySelf(mapper, actor, ImBindingAction.BIND.permission(), false);
            List<ImConfigRow> rows = mapper.loginConfigurations(actor.tenantId());
            if (rows.size() != 1 || rows.get(0).getConfigId() == null) throw ImFailure.bindingUnavailable();
            return credentials(mapper, actor.tenantId(), rows.get(0).getConfigId());
        });
    }

    public WeComCredentials configuration(ImLoginChallenges.Context context) {
        if (context == null || context.purpose() != ImLoginChallenges.Purpose.BIND) throw ImFailure.bindingVerification();
        redirects.verify(context);
        return database.read(context.tenantId(), mapper -> {
            WeComCredentials credentials = credentials(mapper, context.tenantId(), context.configId());
            context.verifyConfiguration(credentials);
            return credentials;
        });
    }

    public Summary bind(ImBindingIdentity.Verification verification, ImBindingMembers.Proof proof, Supplier<Void> consume) {
        if (verification == null || proof == null || consume == null) throw ImFailure.bindingVerification();
        ImActors.Actor actor = verification.actor();
        ImLoginChallenges.Context context = proof.context();
        ImBindingFlow.verifyOwner(context, verification);
        try {
            return database.exclusive(actor.tenantId(), mapper -> {
                if (mapper.lockUser(actor.tenantId(), actor.userId()) == null) throw ImFailure.unauthenticated();
                if (mapper.lockConfig(actor.tenantId(), context.configId()) == null) throw ImFailure.bindingUnavailable();
                List<ImBindingRow> conflicts = mapper.bindingConflicts(actor.tenantId(), context.configId(), actor.userId(), proof.member().externalUserId());
                if (mapper.lockLoginTenant(actor.tenantId()) == null || mapper.lockLoginTotp(actor.tenantId(), actor.userId()).size() > 1) {
                    throw ImFailure.bindingVerification();
                }
                actors.verifySelf(mapper, actor, ImBindingAction.BIND.permission(), false);
                TenantPermissionPolicy.Entitlement entitlement = permissions.current(actor.tenantId());
                if (entitlement == null) throw ImFailure.bindingUnavailable();
                if (entitlement.restricted() && !entitlement.menuIds().isEmpty()
                        && mapper.lockLoginMenus(entitlement.menuIds()).size() != entitlement.menuIds().size()) throw ImFailure.forbidden();
                configuration(context);
                if (!conflicts.isEmpty()) throw ImFailure.bindingConflict();
                consume.get();
                ImBindingRow row = new ImBindingRow();
                row.setTenantId(actor.tenantId());
                row.setConfigId(context.configId());
                row.setUserId(actor.userId());
                row.setImType("WECOM");
                row.setImUserId(proof.member().externalUserId());
                row.setBindType("SCAN_BIND");
                row.setStatus("ACTIVE");
                row.setVersion(0);
                row.setBindTime(LocalDateTime.now().withNano(0));
                row.setCreateTime(row.getBindTime());
                row.setUpdateTime(row.getBindTime());
                row.setCreateBy(Long.toString(actor.userId()));
                row.setUpdateBy(row.getCreateBy());
                if (mapper.insertBinding(row) != 1 || row.getMappingId() == null) throw ImFailure.persistence();
                audit(actor, row);
                actors.verifySelf(mapper, actor, ImBindingAction.BIND.permission(), false);
                configuration(context);
                return view(row, actor);
            });
        } catch (DuplicateKeyException failure) { throw ImFailure.bindingConflict(); }
    }

    public void unbind(ImBindingIdentity.Verification verification, Selection selection, Supplier<Void> consume) {
        if (verification == null || verification.identity().action() != ImBindingAction.UNBIND || selection == null || consume == null) {
            throw ImFailure.bindingVerification();
        }
        ImActors.Actor actor = verification.actor();
        database.exclusive(actor.tenantId(), mapper -> {
            if (mapper.lockUser(actor.tenantId(), actor.userId()) == null) throw ImFailure.unauthenticated();
            List<ImBindingRow> rows = mapper.ownBindings(actor.tenantId(), actor.userId());
            if (rows.size() != 1) throw ImFailure.bindingChanged();
            ImBindingRow row = rows.get(0);
            Summary summary = view(row, actor);
            if (summary.mappingId() != selection.mappingId() || summary.version() != selection.version()) throw ImFailure.bindingChanged();
            if (mapper.lockConfig(actor.tenantId(), summary.configId()) == null
                    || !Objects.equals(mapper.lockLoginBinding(actor.tenantId(), summary.mappingId()), summary.mappingId())) throw ImFailure.bindingChanged();
            if (mapper.lockLoginTenant(actor.tenantId()) == null || mapper.lockLoginTotp(actor.tenantId(), actor.userId()).size() > 1) {
                throw ImFailure.bindingVerification();
            }
            actors.verifySelf(mapper, actor, ImBindingAction.UNBIND.permission(), false);
            TenantPermissionPolicy.Entitlement entitlement = permissions.current(actor.tenantId());
            if (entitlement == null) throw ImFailure.forbidden();
            if (entitlement.restricted() && !entitlement.menuIds().isEmpty()
                    && mapper.lockLoginMenus(entitlement.menuIds()).size() != entitlement.menuIds().size()) throw ImFailure.forbidden();
            requireSelfUnbind(summary);
            consume.get();
            if (mapper.removeOwnBinding(actor.tenantId(), actor.userId(), selection.mappingId(), selection.version()) != 1) throw ImFailure.bindingChanged();
            auditUnbind(actor, summary);
            actors.verifySelf(mapper, actor, ImBindingAction.UNBIND.permission(), false);
            return null;
        });
    }

    private void requireSelfUnbind(Summary binding) {
        if ("AUTO_SYNC".equals(binding.bindType())) throw ImFailure.bindingManaged();
        if (!List.of("SCAN_BIND", "MANUAL_BIND").contains(binding.bindType()) || binding.version() < 0) throw ImFailure.bindingChanged();
    }

    private void auditUnbind(ImActors.Actor actor, Summary binding) {
        SysAuditLogEntity entry = new SysAuditLogEntity();
        entry.setTenantId(actor.tenantId());
        entry.setBizModule("system");
        entry.setAuditName("IM_SELF_UNBIND");
        entry.setAuditField("mapping:" + binding.mappingId());
        entry.setBeforeVal("config=" + binding.configId() + ";type=" + binding.bindType() + ";version=" + binding.version());
        entry.setAfterVal("UNBOUND");
        entry.setHighRisk(1);
        entry.setRiskLevel("HIGH");
        entry.setCreateBy(Long.toString(actor.userId()));
        entry.setCreateTime(LocalDateTime.now());
        try { if (audits.insert(entry) != 1) throw ImFailure.audit(); }
        catch (RuntimeException failure) { throw ImFailure.audit(); }
    }

    private WeComCredentials credentials(ImMapper mapper, long tenantId, long configId) {
        rules.requireDeployment();
        redirects.bindingDestination();
        SysTenant tenant = mapper.tenant(tenantId);
        if (tenant == null || !Objects.equals(tenant.getTenantId(), tenantId) || !"0".equals(tenant.getStatus())
                || !Integer.valueOf(0).equals(tenant.getDeleted()) || tenant.getExpireTime() != null && !tenant.getExpireTime().isAfter(LocalDateTime.now())) {
            throw ImFailure.bindingUnavailable();
        }
        TenantPermissionPolicy.Entitlement entitlement = permissions.current(tenantId);
        if (entitlement == null) throw ImFailure.bindingUnavailable();
        if (entitlement.restricted() && (!entitlement.menuIds().containsAll(List.of(1788L, 1789L))
                || !entitlement.permissions().containsAll(List.of("system:im:binding:mine", ImBindingAction.BIND.permission())))) throw ImFailure.forbidden();
        ImConfigRow configuration = mapper.config(tenantId, configId);
        if (configuration == null || !Objects.equals(configuration.getTenantId(), tenantId)
                || !Objects.equals(configuration.getConfigId(), configId) || !"WECOM".equals(configuration.getImType())
                || !Integer.valueOf(0).equals(configuration.getDeleted()) || !"ENABLED".equals(configuration.getStatus())
                || configuration.getVersion() == null || configuration.getVersion() < 0 || configuration.getVersion() == Integer.MAX_VALUE) {
            throw ImFailure.bindingUnavailable();
        }
        return rules.credentials(configuration);
    }

    private Summary view(ImBindingRow row, ImActors.Actor actor) {
        if (row == null || !Objects.equals(row.getTenantId(), actor.tenantId()) || !Objects.equals(row.getUserId(), actor.userId())
                || !"WECOM".equals(row.getImType()) || row.getMappingId() == null || row.getVersion() == null) throw ImFailure.bindingConflict();
        return new Summary(row.getMappingId(), row.getConfigId(), row.getImUserId(), row.getBindType(), row.getStatus(), row.getVersion(), row.getBindTime());
    }

    private void audit(ImActors.Actor actor, ImBindingRow row) {
        SysAuditLogEntity entry = new SysAuditLogEntity();
        entry.setTenantId(actor.tenantId());
        entry.setBizModule("system");
        entry.setAuditName("IM_SELF_BIND");
        entry.setAuditField("mapping:" + row.getMappingId());
        entry.setBeforeVal("UNBOUND");
        entry.setAfterVal("config=" + row.getConfigId() + ";type=SCAN_BIND;status=ACTIVE");
        entry.setHighRisk(1);
        entry.setRiskLevel("HIGH");
        entry.setCreateBy(Long.toString(actor.userId()));
        entry.setCreateTime(LocalDateTime.now());
        try { if (audits.insert(entry) != 1) throw ImFailure.audit(); }
        catch (RuntimeException failure) { throw ImFailure.audit(); }
    }

    public record Summary(long mappingId, long configId, String externalAccount, String bindType, String status, int version, LocalDateTime bindTime) {
        @Override public String toString() { return "ImBindingAccounts.Summary[redacted]"; }
    }

    public record Selection(long mappingId, int version) {
        public Selection { if (mappingId <= 0 || version < 0) throw ImFailure.bindingRequest(); }
    }

    public record Overview(Summary binding, boolean canBind, String reasonCode, String message, boolean canUnbind, String unbindMessage) {
        public Overview(Summary binding, boolean canBind, String reasonCode, String message) { this(binding, canBind, reasonCode, message, false, null); }
        @Override public String toString() { return "ImBindingAccounts.Overview[redacted]"; }
    }
}
