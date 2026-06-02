package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.security.UserDeletionGuard;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmLead;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmQuote;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.CrmRenewal;
import com.cloudflow.crm.domain.CrmServiceTicket;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.mapper.CrmLeadMapper;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.mapper.CrmQuoteMapper;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import com.cloudflow.crm.mapper.CrmRenewalMapper;
import com.cloudflow.crm.mapper.CrmServiceTicketMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
@RequiredArgsConstructor
public class CrmUserDeletionGuard implements UserDeletionGuard {

    private final CrmLeadMapper crmLeadMapper;
    private final CrmCustomerMapper crmCustomerMapper;
    private final CrmOpportunityMapper crmOpportunityMapper;
    private final CrmQuoteMapper crmQuoteMapper;
    private final CrmReceivableMapper crmReceivableMapper;
    private final CrmRenewalMapper crmRenewalMapper;
    private final CrmServiceTicketMapper crmServiceTicketMapper;

    @Override
    public List<String> findBlockingReferences(Long userId) {
        List<String> result = new ArrayList<>();
        addIfPresent(result, "CRM线索", crmLeadMapper.selectCount(
                new LambdaQueryWrapper<CrmLead>().eq(CrmLead::getOwnerId, userId)));
        addIfPresent(result, "CRM客户", crmCustomerMapper.selectCount(
                new LambdaQueryWrapper<CrmCustomer>().eq(CrmCustomer::getOwnerId, userId)));
        addIfPresent(result, "CRM商机", crmOpportunityMapper.selectCount(
                new LambdaQueryWrapper<CrmOpportunity>().eq(CrmOpportunity::getOwnerId, userId)));
        addIfPresent(result, "CRM报价", crmQuoteMapper.selectCount(
                new LambdaQueryWrapper<CrmQuote>().eq(CrmQuote::getOwnerId, userId)));
        addIfPresent(result, "CRM回款", crmReceivableMapper.selectCount(
                new LambdaQueryWrapper<CrmReceivable>().eq(CrmReceivable::getOwnerId, userId)));
        addIfPresent(result, "CRM续约", crmRenewalMapper.selectCount(
                new LambdaQueryWrapper<CrmRenewal>().eq(CrmRenewal::getOwnerId, userId)));
        addIfPresent(result, "CRM工单", crmServiceTicketMapper.selectCount(
                new LambdaQueryWrapper<CrmServiceTicket>().eq(CrmServiceTicket::getOwnerId, userId)));
        return result;
    }

    private void addIfPresent(List<String> result, String label, Long count) {
        if (count != null && count > 0) {
            result.add(label + " " + count + " 条");
        }
    }
}
