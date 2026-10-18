package com.cloudflow.crm.service.opportunity;

import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
@RequiredArgsConstructor
public class CrmOpportunityAccessService {
    private final CrmOpportunityMapper opportunities;

    public CrmOpportunity read(Long id) {
        CrmRecordSupport.require(id, "商机ID不能为空");
        return verify(opportunities.selectByIdWithDataScope(id, DataScopeUtils.listScope("scope_dept_id", "scope_owner_id")));
    }

    public CrmOpportunity lock(Long id) {
        CrmOpportunity entity = lockInScope(id);
        DataScopeUtils.assertOwnership(entity, CrmOpportunity::getOwnerId, "商机");
        return entity;
    }

    public CrmOpportunity lockInScope(Long id) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("商机写入必须使用业务事务");
        CrmRecordSupport.require(id, "商机ID不能为空");
        return verify(opportunities.lockAccessible(id, CrmRecordSupport.tenantId(), DataScopeUtils.listScope("scope_dept_id", "scope_owner_id")));
    }

    private CrmOpportunity verify(CrmOpportunity opportunity) {
        if (opportunity == null || !Objects.equals(CrmRecordSupport.tenantId(), opportunity.getTenantId()) || !Integer.valueOf(0).equals(opportunity.getDeleted()))
            throw new CrmBusinessException("商机不存在或无权访问");
        return opportunity;
    }
}
