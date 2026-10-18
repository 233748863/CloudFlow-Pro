package com.cloudflow.crm.service.receivable;

import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
@RequiredArgsConstructor
public class CrmReceivableAccessService {
    private final CrmReceivableMapper receivables;

    public CrmReceivable read(Long id) {
        identifier(id);
        return verify(receivables.selectByIdWithDataScope(id, DataScopeUtils.listScope("scope_dept_id", "scope_owner_id")));
    }

    public CrmReceivable lockInScope(Long id) {
        transaction();
        identifier(id);
        return verify(receivables.lockAccessible(id, CrmRecordSupport.tenantId(), DataScopeUtils.listScope("scope_dept_id", "scope_owner_id")));
    }

    public CrmReceivable lockOwned(Long id) {
        CrmReceivable record = lockInScope(id);
        DataScopeUtils.assertOwnership(record, CrmReceivable::getOwnerId, "应收款");
        return record;
    }

    public CrmReceivable lockInternal(Long id) {
        transaction();
        identifier(id);
        return verify(receivables.lockById(id));
    }

    private CrmReceivable verify(CrmReceivable record) {
        if (record == null || !Objects.equals(CrmRecordSupport.tenantId(), record.getTenantId()) || !Integer.valueOf(0).equals(record.getDeleted()))
            throw new CrmBusinessException("回款计划不存在或无权访问");
        return record;
    }

    private void identifier(Long id) {
        if (id == null || id <= 0) throw new CrmBusinessException("回款ID无效");
    }

    private void transaction() {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("应收写入必须使用业务事务");
    }
}
