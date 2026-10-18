package com.cloudflow.crm.service.deal;

import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.crm.domain.CrmQuote;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmQuoteMapper;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
@RequiredArgsConstructor
public class CrmQuoteAccessService {
    private final CrmQuoteMapper quotes;

    public CrmQuote read(Long id) {
        CrmRecordSupport.require(id, "报价ID不能为空");
        return verify(quotes.selectByIdWithDataScope(id, DataScopeUtils.listScope("scope_dept_id", "scope_owner_id")));
    }

    public CrmQuote lock(Long id) {
        CrmQuote quote = lockInScope(id);
        DataScopeUtils.assertOwnership(quote, CrmQuote::getOwnerId, "报价");
        return quote;
    }

    public CrmQuote lockInScope(Long id) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("报价写入必须使用业务事务");
        CrmRecordSupport.require(id, "报价ID不能为空");
        return verify(quotes.lockAccessible(id, CrmRecordSupport.tenantId(), DataScopeUtils.listScope("scope_dept_id", "scope_owner_id")));
    }

    private CrmQuote verify(CrmQuote quote) {
        if (quote == null || !Objects.equals(CrmRecordSupport.tenantId(), quote.getTenantId()) || !Integer.valueOf(0).equals(quote.getDeleted()))
            throw new CrmBusinessException("报价不存在或无权访问");
        return quote;
    }
}
