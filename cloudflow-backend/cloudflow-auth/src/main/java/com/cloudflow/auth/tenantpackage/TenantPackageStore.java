package com.cloudflow.auth.tenantpackage;

import com.cloudflow.auth.mapper.TenantPackageMapper;
import com.cloudflow.common.tenant.TenantBroker;
import java.util.function.Function;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

@Component
public class TenantPackageStore {
    private final TenantPackageMapper mapper;
    private final TransactionTemplate transactions;

    public TenantPackageStore(TenantPackageMapper mapper, PlatformTransactionManager transactionManager) {
        this.mapper = mapper;
        transactions = new TransactionTemplate(transactionManager);
        transactions.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        transactions.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
    }

    public <Result> Result read(Function<TenantPackageMapper, Result> operation) {
        return TenantBroker.applyWithoutTenant(ignored -> operation.apply(mapper));
    }

    public <Result> Result write(Function<TenantPackageMapper, Result> operation) {
        return TenantBroker.applyWithoutTenant(ignored -> transactions.execute(status -> operation.apply(mapper)));
    }
}
