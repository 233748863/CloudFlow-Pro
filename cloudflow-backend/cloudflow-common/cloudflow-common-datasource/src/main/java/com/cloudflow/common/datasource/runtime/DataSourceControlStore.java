package com.cloudflow.common.datasource.runtime;

import com.baomidou.dynamic.datasource.toolkit.DynamicDataSourceContextHolder;
import com.cloudflow.common.datasource.mapper.RuntimeDataSourceMapper;
import com.cloudflow.common.tenant.TenantBroker;
import java.util.function.Function;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

@Component
public class DataSourceControlStore {
    private final RuntimeDataSourceMapper mapper;
    private final DataSourceRuntimeProperties properties;
    private final String primary;
    private final TransactionTemplate transaction;

    public DataSourceControlStore(RuntimeDataSourceMapper mapper, DataSourceRuntimeProperties properties,
            PlatformTransactionManager transactions, @Value("${spring.datasource.dynamic.primary:master}") String primary) {
        this.mapper = mapper;
        this.properties = properties;
        this.primary = primary;
        transaction = new TransactionTemplate(transactions);
        transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        transaction.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        transaction.setTimeout(10);
    }

    public <Result> Result read(Function<RuntimeDataSourceMapper, Result> operation) {
        return inTenant(tenantId(), operation);
    }

    private <Result> Result inTenant(Long tenantId, Function<RuntimeDataSourceMapper, Result> operation) {
        if (tenantId == null || tenantId <= 0) throw DataSourceFailure.disabled();
        DynamicDataSourceContextHolder.push(primary);
        try { return TenantBroker.applyAs(tenantId, ignored -> operation.apply(mapper)); }
        finally { DynamicDataSourceContextHolder.poll(); }
    }

    public <Result> Result write(Function<RuntimeDataSourceMapper, Result> operation) {
        return read(selected -> transaction.execute(status -> operation.apply(selected)));
    }

    public void recordAudit(Long tenantId, Runnable operation) {
        inTenant(tenantId, selected -> {
            transaction.executeWithoutResult(status -> operation.run());
            return null;
        });
    }

    public Long tenantId() {
        if (properties.getManagementTenantId() == null || properties.getManagementTenantId() <= 0) throw DataSourceFailure.disabled();
        return properties.getManagementTenantId();
    }
}
