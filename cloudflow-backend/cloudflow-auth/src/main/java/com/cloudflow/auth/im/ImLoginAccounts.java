package com.cloudflow.auth.im;

import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.mapper.ImMapper;
import com.cloudflow.auth.service.ISysUserBlacklistService;
import com.cloudflow.auth.service.LoginLockService;
import com.cloudflow.common.core.permission.TenantPermissionPolicy;
import com.cloudflow.common.tenant.TenantBroker;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.function.BiFunction;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ImLoginAccounts {
    private final ImMapper mapper;
    private final ImDatabase database;
    private final ImConfigRules rules;
    private final ImLoginRedirects redirects;
    private final ISysUserBlacklistService blacklist;
    private final LoginLockService locks;
    private final TenantPermissionPolicy permissions;

    public WeComCredentials configuration(String tenantCode) {
        rules.requireDeployment();
        if (tenantCode == null || tenantCode.isBlank() || tenantCode.length() > 128
                || !tenantCode.equals(tenantCode.trim()) || tenantCode.codePoints().anyMatch(Character::isISOControl)) {
            throw ImFailure.loginAccount();
        }
        List<Long> tenants = TenantBroker.applyWithoutTenant(ignored -> mapper.loginTenants(tenantCode));
        if (tenants.size() != 1 || tenants.get(0) == null || tenants.get(0) <= 0) throw ImFailure.loginAccount();
        return database.read(tenants.get(0), scoped -> {
            tenant(scoped, tenants.get(0));
            List<ImConfigRow> configurations = scoped.loginConfigurations(tenants.get(0));
            if (configurations.size() != 1) throw ImFailure.loginAccount();
            ImConfigRow configuration = configurations.get(0);
            if (configuration == null || configuration.getConfigId() == null) throw ImFailure.loginAccount();
            return credentials(scoped, tenants.get(0), configuration.getConfigId());
        });
    }

    public Account identify(ImLoginChallenges.Context context, ImIdentityProvider.Member member) {
        if (context == null || member == null || context.purpose() == ImLoginChallenges.Purpose.BIND) throw ImFailure.loginAccount();
        redirects.verify(context.callbackUrl(), context.redirectPath());
        if (member.tenantId() != context.tenantId() || member.configId() != context.configId()
                || member.configVersion() != context.configVersion() || !Objects.equals(member.corpId(), context.corpId())) {
            throw ImFailure.loginAccount();
        }
        return database.read(context.tenantId(), scoped -> {
            context.verifyConfiguration(credentials(scoped, context.tenantId(), context.configId()));
            Binding binding = binding(scoped, context.tenantId(), context.configId(), member.externalUserId());
            SysUser user = user(scoped, context.tenantId(), binding.userId());
            context.verifyConfiguration(credentials(scoped, context.tenantId(), context.configId()));
            return new Account(context.tenantId(), context.configId(), context.configVersion(), context.corpId(), context.agentId(),
                    binding.mappingId(), binding.version(), binding.externalUserId(), user.getUserId(), user.getVersion());
        });
    }

    public WeComCredentials configuration(ImLoginChallenges.Context context) {
        if (context == null || context.purpose() == ImLoginChallenges.Purpose.BIND) throw ImFailure.loginAccount();
        redirects.verify(context.callbackUrl(), context.redirectPath());
        return database.read(context.tenantId(), scoped -> {
            WeComCredentials credentials = credentials(scoped, context.tenantId(), context.configId());
            context.verifyConfiguration(credentials);
            return credentials;
        });
    }

    public <Result> Result locked(Account account, BiFunction<SysUser, SysTenant, Result> operation) {
        if (account == null || operation == null) throw ImFailure.loginAccount();
        return database.exclusive(account.tenantId(), scoped -> {
            if (scoped.lockUser(account.tenantId(), account.userId()) == null
                    || scoped.lockConfig(account.tenantId(), account.configId()) == null
                    || !Objects.equals(scoped.lockLoginBinding(account.tenantId(), account.mappingId()), account.mappingId())
                    || scoped.lockLoginTenant(account.tenantId()) == null) throw ImFailure.loginAccount();
            if (scoped.lockLoginTotp(account.tenantId(), account.userId()).size() > 1) throw ImFailure.loginAccount();
            TenantPermissionPolicy.Entitlement entitlement = permissions.current(account.tenantId());
            if (entitlement == null) throw ImFailure.loginUnavailable();
            if (entitlement.restricted() && (!entitlement.menuIds().isEmpty()
                    && scoped.lockLoginMenus(entitlement.menuIds()).size() != entitlement.menuIds().size())) throw ImFailure.loginPackage();
            SysUser user = recheck(account);
            Result result = operation.apply(user, tenant(scoped, account.tenantId()));
            recheck(account);
            return result;
        });
    }

    public SysUser recheck(Account account) {
        if (account == null) throw ImFailure.loginAccount();
        return database.read(account.tenantId(), scoped -> {
            verifyConfiguration(account, credentials(scoped, account.tenantId(), account.configId()));
            Binding binding = binding(scoped, account.tenantId(), account.configId(), account.externalUserId());
            if (binding.mappingId() != account.mappingId() || binding.version() != account.mappingVersion()
                    || binding.userId() != account.userId()) throw ImFailure.loginAccount();
            SysUser user = user(scoped, account.tenantId(), account.userId());
            if (!Objects.equals(user.getVersion(), account.userVersion())) throw ImFailure.loginAccount();
            verifyConfiguration(account, credentials(scoped, account.tenantId(), account.configId()));
            return user;
        });
    }

    private WeComCredentials credentials(ImMapper scoped, long tenantId, long configId) {
        rules.requireDeployment();
        tenant(scoped, tenantId);
        TenantPermissionPolicy.Entitlement entitlement = permissions.current(tenantId);
        if (entitlement == null) throw ImFailure.loginUnavailable();
        if (entitlement.restricted() && (!entitlement.menuIds().contains(1788L)
                || !entitlement.permissions().contains("system:im:binding:mine"))) throw ImFailure.loginPackage();
        ImConfigRow configuration = scoped.config(tenantId, configId);
        if (configuration == null || !Objects.equals(configuration.getTenantId(), tenantId)
                || !Objects.equals(configuration.getConfigId(), configId) || !"WECOM".equals(configuration.getImType())
                || !Integer.valueOf(0).equals(configuration.getDeleted()) || !"ENABLED".equals(configuration.getStatus())
                || !Boolean.TRUE.equals(configuration.getLoginEnabled()) || configuration.getVersion() == null
                || configuration.getVersion() < 0 || configuration.getVersion() == Integer.MAX_VALUE
                || configuration.getCallbackUrl() == null || !configuration.getCallbackUrl().equals(rules.expectedCallbackUrl(configId))) {
            throw ImFailure.loginAccount();
        }
        WeComCredentials credentials = rules.credentials(configuration);
        credentials.requireCallbackKeys();
        return credentials;
    }

    private SysTenant tenant(ImMapper scoped, long tenantId) {
        SysTenant tenant = scoped.tenant(tenantId);
        if (tenant == null || !Objects.equals(tenant.getTenantId(), tenantId) || !Integer.valueOf(0).equals(tenant.getDeleted())
                || !"0".equals(tenant.getStatus()) || tenant.getExpireTime() != null && !tenant.getExpireTime().isAfter(LocalDateTime.now())) {
            throw ImFailure.loginAccount();
        }
        return tenant;
    }

    private Binding binding(ImMapper scoped, long tenantId, long configId, String externalUserId) {
        if (externalUserId == null || externalUserId.isBlank() || externalUserId.length() > 128
                || externalUserId.codePoints().anyMatch(Character::isISOControl)) throw ImFailure.loginAccount();
        List<Binding> bindings = scoped.loginBindings(tenantId, configId, externalUserId);
        if (bindings.size() != 1) throw ImFailure.loginAccount();
        Binding binding = bindings.get(0);
        if (binding == null || binding.mappingId() <= 0 || binding.tenantId() != tenantId || binding.configId() != configId
                || binding.userId() <= 0 || !externalUserId.equals(binding.externalUserId()) || binding.version() < 0
                || binding.version() == Integer.MAX_VALUE || !("ACTIVE".equals(binding.status()) || "OUT_OF_SCOPE".equals(binding.status()))) {
            throw ImFailure.loginAccount();
        }
        return binding;
    }

    private SysUser user(ImMapper scoped, long tenantId, long userId) {
        SysUser user = scoped.loginUser(tenantId, userId);
        if (user == null || !Objects.equals(user.getTenantId(), tenantId) || !Objects.equals(user.getUserId(), userId)
                || !Integer.valueOf(0).equals(user.getDeleted()) || !"0".equals(user.getStatus()) || user.getVersion() == null
                || user.getVersion() < 0 || user.getVersion() == Integer.MAX_VALUE || user.getUserName() == null
                || user.getUserName().isBlank() || blacklist.isBanned(userId) || locks.isLocked(user.getUserName(), tenantId)) {
            throw ImFailure.loginAccount();
        }
        return user;
    }

    private void verifyConfiguration(Account account, WeComCredentials credentials) {
        if (credentials.tenantId() != account.tenantId() || credentials.configId() != account.configId()
                || credentials.version() != account.configVersion() || !credentials.corpId().equals(account.corpId())
                || credentials.agentId() != account.agentId()) throw ImFailure.loginAccount();
    }

    public record Binding(long mappingId, long tenantId, long configId, long userId, String externalUserId, String status, int version) {
        @Override public String toString() { return "ImLoginAccounts.Binding[redacted]"; }
    }

    public record Account(long tenantId, long configId, int configVersion, String corpId, long agentId,
            long mappingId, int mappingVersion, String externalUserId, long userId, int userVersion) {
        public Account {
            if (tenantId <= 0 || configId <= 0 || configVersion < 0 || configVersion == Integer.MAX_VALUE
                    || corpId == null || !corpId.matches("[A-Za-z0-9_-]{1,100}") || agentId <= 0
                    || mappingId <= 0 || mappingVersion < 0 || mappingVersion == Integer.MAX_VALUE || userId <= 0
                    || userVersion < 0 || userVersion == Integer.MAX_VALUE || externalUserId == null
                    || externalUserId.isBlank() || externalUserId.length() > 128
                    || externalUserId.codePoints().anyMatch(Character::isISOControl)) throw ImFailure.loginAccount();
        }

        @Override public String toString() { return "ImLoginAccounts.Account[redacted]"; }
    }
}
