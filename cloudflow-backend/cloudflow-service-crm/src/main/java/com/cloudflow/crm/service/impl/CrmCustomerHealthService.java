package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmFollowUp;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.CrmRenewal;
import com.cloudflow.crm.domain.CrmServiceTicket;
import com.cloudflow.crm.domain.vo.CrmHealthReasonItemVO;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class CrmCustomerHealthService {
    private final CrmCustomerMapper customerMapper;

    /** 调用方完成客户访问校验后，复用其已加载的有效记录。 */
    @Transactional(rollbackFor = Exception.class)
    public List<CrmHealthReasonItemVO> refresh(CrmCustomer customer, List<CrmFollowUp> followUps,
                                              List<CrmRenewal> renewals, List<CrmReceivable> receivables,
                                              List<CrmServiceTicket> tickets) {
        LocalDateTime now = LocalDateTime.now();
        CrmHealthCalculator.HealthSnapshot snapshot = CrmHealthCalculator.calculate(
                customer.getCustomerId(), followUps, renewals, receivables, tickets, now);
        String operator = StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system";
        LambdaUpdateWrapper<CrmCustomer> update = new LambdaUpdateWrapper<CrmCustomer>()
                .eq(CrmCustomer::getCustomerId, customer.getCustomerId())
                .eq(CrmCustomer::getTenantId, customer.getTenantId())
                .eq(CrmCustomer::getDeleted, CrmConstants.DelFlag.NORMAL)
                .set(CrmCustomer::getHealthLevel, snapshot.level())
                .set(CrmCustomer::getHealthReason, snapshot.summary())
                .set(CrmCustomer::getLastFollowUpTime, snapshot.lastFollowUp())
                .set(CrmCustomer::getNextFollowUpTime, snapshot.nextFollowUp())
                .set(CrmCustomer::getUpdateBy, operator)
                .set(CrmCustomer::getUpdateTime, now);
        CrmRecordSupport.saved(customerMapper.update(null, update));
        customer.setHealthLevel(snapshot.level());
        customer.setHealthReason(snapshot.summary());
        customer.setLastFollowUpTime(snapshot.lastFollowUp());
        customer.setNextFollowUpTime(snapshot.nextFollowUp());
        customer.setUpdateBy(operator);
        customer.setUpdateTime(now);
        return snapshot.reasons();
    }
}
