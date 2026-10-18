package com.cloudflow.crm.service.impl;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PortalFinanceState;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.utils.PortalFinanceRules;
import com.cloudflow.crm.mapper.CrmFinancePublicationMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CrmFinancePublicationWriter {
    private final CrmFinancePublicationMapper records;

    @Transactional(propagation = Propagation.MANDATORY)
    @Audit(name = "回款财务公开确认与撤回", oldVal = "#before",
            newVal = "@crmFinancePublicationMapper.state(#before.tenantId, #before.id, false)", diff = true, highRisk = true)
    public void persist(PortalFinanceState before, PortalFinanceRules.Change change) {
        int count = change.publish()
                ? records.publish(before.getTenantId(), before.getId(), change.version(), UserContext.getUserId(),
                        UserContext.getUserName(), PortalFinanceRules.jsonFiles(change.fileIds()))
                : records.withdraw(before.getTenantId(), before.getId(), change.version(), UserContext.getUserName());
        if (count != 1) throw new ServiceException("单据已变化，请重新读取并核对", 409);
    }
}
