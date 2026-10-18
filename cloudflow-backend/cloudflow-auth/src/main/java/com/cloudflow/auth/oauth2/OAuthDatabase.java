package com.cloudflow.auth.oauth2;

import com.cloudflow.auth.mapper.OAuthMapper;
import com.cloudflow.common.tenant.TenantBroker;
import java.util.function.Function;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Component
public class OAuthDatabase {
    private final OAuthMapper mapper;
    private final TransactionTemplate transactions;

    public OAuthDatabase(OAuthMapper mapper, PlatformTransactionManager transactionManager) {
        this.mapper = mapper;
        this.transactions = new TransactionTemplate(transactionManager);
    }

    public <Result> Result read(Function<OAuthMapper, Result> operation) {
        return TenantBroker.applyWithoutTenant(ignored -> operation.apply(mapper));
    }

    public <Result> Result write(Function<OAuthMapper, Result> operation) {
        return TenantBroker.applyWithoutTenant(ignored -> transactions.execute(status -> operation.apply(mapper)));
    }
}

