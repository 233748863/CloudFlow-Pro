package com.cloudflow.common.tenant.session;

import com.cloudflow.common.core.permission.LoginSessionPolicy;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.session.mapper.LoginSessionMapper;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

public final class LoginSessionPolicyService implements LoginSessionPolicy {
    private static final org.slf4j.Logger LOGGER = org.slf4j.LoggerFactory.getLogger(LoginSessionPolicyService.class);
    private final LoginSessionMapper mapper;
    private final TransactionTemplate reads;

    public LoginSessionPolicyService(LoginSessionMapper mapper, PlatformTransactionManager transactions) {
        this.mapper = mapper;
        reads = new TransactionTemplate(transactions);
        reads.setReadOnly(true);
        reads.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        reads.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    @Override
    public boolean accepts(long ownerTenantId, long tenantId, long userId, int userVersion) {
        if (ownerTenantId <= 0 || tenantId <= 0 || userId <= 0 || userVersion < 0) return false;
        boolean previousSkip = TenantContext.getTenantSkip();
        try {
            return Boolean.TRUE.equals(TenantBroker.applyWithoutTenant(ignored -> reads.execute(status ->
                    mapper.active(ownerTenantId, tenantId, userId, userVersion) == 1)));
        } catch (RuntimeException unavailable) {
            Throwable cause = unavailable;
            while (cause.getCause() != null && cause.getCause() != cause) cause = cause.getCause();
            StackTraceElement location = cause.getStackTrace().length == 0 ? null : cause.getStackTrace()[0];
            LOGGER.warn("登录状态核验暂不可用，异常类型={}，位置={}", cause.getClass().getSimpleName(), location);
            return false;
        }
        finally {
            if (previousSkip) TenantContext.setTenantSkip();
            else TenantContext.clearTenantSkip();
        }
    }
}
