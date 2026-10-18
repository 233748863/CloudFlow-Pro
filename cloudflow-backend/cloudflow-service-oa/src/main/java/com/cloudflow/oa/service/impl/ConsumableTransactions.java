package com.cloudflow.oa.service.impl;

import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.function.Supplier;

@Component
public class ConsumableTransactions {
    private final TransactionTemplate transactions;

    public ConsumableTransactions(PlatformTransactionManager manager) {
        transactions = new TransactionTemplate(manager);
        transactions.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
    }

    public <T> T execute(Supplier<T> action) {
        return transactions.execute(status -> action.get());
    }
}
