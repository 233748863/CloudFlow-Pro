package com.cloudflow.auth.im;

import com.cloudflow.auth.mapper.ImMapper;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.tenant.TenantContext;
import java.util.function.Function;
import java.util.function.Supplier;
import java.time.Duration;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionTimedOutException;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

@Component
public class ImDatabase {
    private final ImMapper mapper;
    private final TransactionTemplate transactions;
    private final TransactionTemplate exclusiveTransactions;

    public ImDatabase(ImMapper mapper, PlatformTransactionManager transactionManager) {
        this.mapper = mapper;
        transactions = new TransactionTemplate(transactionManager);
        exclusiveTransactions = new TransactionTemplate(transactionManager);
        exclusiveTransactions.setIsolationLevel(TransactionDefinition.ISOLATION_SERIALIZABLE);
    }

    public <Result> Result read(long tenantId, Function<ImMapper, Result> operation) {
        if (tenantId <= 0) throw ImFailure.unauthenticated();
        return scoped(tenantId, () -> operation.apply(mapper));
    }

    public <Result> Result write(long tenantId, Function<ImMapper, Result> operation) {
        if (tenantId <= 0) throw ImFailure.unauthenticated();
        if (ImSyncBudget.active()) return bounded(tenantId, transactions, operation);
        return scoped(tenantId, () -> transactions.execute(status -> operation.apply(mapper)));
    }

    <Result> Result exclusive(long tenantId, Function<ImMapper, Result> operation) {
        if (tenantId <= 0) throw ImFailure.unauthenticated();
        if (TransactionSynchronizationManager.isActualTransactionActive()) throw ImFailure.orgLocal();
        return bounded(tenantId, exclusiveTransactions, operation);
    }

    private <Result> Result bounded(long tenantId, TransactionTemplate template, Function<ImMapper, Result> operation) {
        return ImSyncBudget.within(System.nanoTime() + Duration.ofSeconds(45).toNanos(), () -> {
            TransactionTemplate bounded = new TransactionTemplate(template.getTransactionManager(), template);
            long milliseconds = ImSyncBudget.limit(Duration.ofSeconds(45)).toMillis();
            bounded.setTimeout((int) Math.max(1, (milliseconds + 999) / 1000));
            try {
                return scoped(tenantId, () -> bounded.execute(status -> {
                    ImSyncBudget.check();
                    Result result = operation.apply(mapper);
                    ImSyncBudget.check();
                    return result;
                }));
            } catch (QueryTimeoutException | TransactionTimedOutException failure) { throw new ImSyncBudget.Exhausted(); }
        });
    }

    private <Result> Result scoped(long tenantId, Supplier<Result> operation) {
        boolean previousSkip = TenantContext.getTenantSkip();
        try {
            TenantContext.clearTenantSkip();
            return TenantBroker.applyAs(tenantId, ignored -> operation.get());
        } finally {
            if (previousSkip) TenantContext.setTenantSkip();
            else TenantContext.clearTenantSkip();
        }
    }
}
