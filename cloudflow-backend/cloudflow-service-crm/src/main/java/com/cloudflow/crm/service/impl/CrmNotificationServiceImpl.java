package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import com.cloudflow.crm.service.ICrmNotificationService;
import com.cloudflow.crm.service.remote.RemoteOaService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
public class CrmNotificationServiceImpl implements ICrmNotificationService {

    private final CrmCustomerMapper customerMapper;
    private final CrmReceivableMapper receivableMapper;
    private final CrmOpportunityMapper opportunityMapper;
    private final RemoteOaService remoteOaService;

    @Value("${cloudflow.crm.notification.follow-up-inactive-days:14}")
    private int followUpInactiveDays;

    @Value("${cloudflow.crm.notification.receivable-look-ahead-days:7}")
    private int receivableLookAheadDays;

    @Value("${cloudflow.crm.notification.opportunity-stalled-days:14}")
    private int opportunityStalledDays;

    public CrmNotificationServiceImpl(CrmCustomerMapper customerMapper,
                                      CrmReceivableMapper receivableMapper,
                                      CrmOpportunityMapper opportunityMapper,
                                      RemoteOaService remoteOaService) {
        this.customerMapper = customerMapper;
        this.receivableMapper = receivableMapper;
        this.opportunityMapper = opportunityMapper;
        this.remoteOaService = remoteOaService;
    }

    /** 每天 09:00 触发跟进逾期 / 回款到期 / 商机停滞通知。 */
    @Scheduled(cron = "0 0 9 * * ?")
    public void scheduledDispatch() {
        log.info("CRM notification scheduled dispatch start");
        try {
            int total = dispatchAll();
            log.info("CRM notification scheduled dispatch end, published={}", total);
        } catch (Exception e) {
            log.error("CRM notification scheduled dispatch failed", e);
        }
    }

    @Override
    public int dispatchAll() {
        return dispatchFollowUpOverdue() + dispatchReceivableDue() + dispatchStalledOpportunity();
    }

    @Override
    public int dispatchFollowUpOverdue() {
        LocalDateTime threshold = LocalDateTime.now().minusDays(followUpInactiveDays);
        List<CrmCustomer> rows = customerMapper.selectList(new LambdaQueryWrapper<CrmCustomer>()
                .eq(CrmCustomer::getDelFlag, CrmConstants.DelFlag.NORMAL)
                .eq(CrmCustomer::getPoolFlag, CrmConstants.CustomerPoolFlag.OUT_OF_POOL)
                .isNotNull(CrmCustomer::getOwnerId)
                .and(w -> w.lt(CrmCustomer::getLastFollowUpTime, threshold).or().isNull(CrmCustomer::getLastFollowUpTime)));
        int count = 0;
        for (CrmCustomer customer : rows) {
            String title = "跟进逾期提醒：" + customer.getCustomerName();
            String content = String.format("客户【%s】已超过 %d 天未跟进，建议尽快联系。最近跟进时间：%s",
                    customer.getCustomerName(),
                    followUpInactiveDays,
                    customer.getLastFollowUpTime() == null ? "无" : customer.getLastFollowUpTime().toString());
            if (publish(title, content, "1", "M", customer.getTenantId(), customer.getOwnerId())) {
                count++;
            }
        }
        return count;
    }

    @Override
    public int dispatchReceivableDue() {
        LocalDate today = LocalDate.now();
        LocalDate windowEnd = today.plusDays(receivableLookAheadDays);
        List<CrmReceivable> rows = receivableMapper.selectList(new LambdaQueryWrapper<CrmReceivable>()
                .eq(CrmReceivable::getDelFlag, CrmConstants.DelFlag.NORMAL)
                .ne(CrmReceivable::getStatus, CrmConstants.ReceivableStatus.RECEIVED)
                .gt(CrmReceivable::getOutstandingAmount, BigDecimal.ZERO)
                .isNotNull(CrmReceivable::getDueDate)
                .le(CrmReceivable::getDueDate, windowEnd));
        int count = 0;
        for (CrmReceivable receivable : rows) {
            boolean overdue = receivable.getDueDate().isBefore(today);
            String title = (overdue ? "回款已逾期：" : "回款即将到期：") + receivable.getReceivableName();
            String content = String.format("客户【%s】回款【%s】未结清金额 %s，应收日期 %s。",
                    receivable.getCustomerName(),
                    receivable.getReceivableName(),
                    receivable.getOutstandingAmount(),
                    receivable.getDueDate());
            if (publish(title, content, overdue ? "3" : "1", overdue ? "H" : "M",
                    receivable.getTenantId(), receivable.getOwnerId())) {
                count++;
            }
        }
        return count;
    }

    @Override
    public int dispatchStalledOpportunity() {
        LocalDateTime threshold = LocalDateTime.now().minusDays(opportunityStalledDays);
        List<CrmOpportunity> rows = opportunityMapper.selectList(new LambdaQueryWrapper<CrmOpportunity>()
                .eq(CrmOpportunity::getDelFlag, CrmConstants.DelFlag.NORMAL)
                .eq(CrmOpportunity::getStatus, CrmConstants.OpportunityStatus.OPEN)
                .ne(CrmOpportunity::getStage, CrmConstants.OpportunityStage.WON)
                .ne(CrmOpportunity::getStage, CrmConstants.OpportunityStage.LOST)
                .and(w -> w.lt(CrmOpportunity::getLatestFollowUpTime, threshold).or().isNull(CrmOpportunity::getLatestFollowUpTime)));
        int count = 0;
        for (CrmOpportunity opportunity : rows) {
            String title = "商机停滞提醒：" + opportunity.getOpportunityName();
            String content = String.format("商机【%s】当前阶段【%s】，已超过 %d 天未推进。客户：%s。",
                    opportunity.getOpportunityName(),
                    opportunity.getStage(),
                    opportunityStalledDays,
                    opportunity.getCustomerName());
            if (publish(title, content, "1", "M", opportunity.getTenantId(), opportunity.getOwnerId())) {
                count++;
            }
        }
        return count;
    }

    private boolean publish(String title, String content, String type, String priority, Long tenantId, Long ownerId) {
        try {
            RemoteOaService.AnnouncementPublishRequest request = new RemoteOaService.AnnouncementPublishRequest();
            request.setTitle(title);
            request.setContent(content);
            request.setType(type);
            request.setPriority(priority);
            request.setScopeType("ALL");
            request.setTenantId(tenantId);
            request.setSenderId(ownerId);
            request.setCreateBy("crm-system");
            request.setExpireTime(LocalDateTime.now().plusDays(7));
            R<Long> response = remoteOaService.publishAnnouncement("true", CrmConstants.SERVICE_NAME, request);
            return response != null && response.isSuccess();
        } catch (Exception e) {
            log.warn("CRM publish announcement failed: {} - {}", title, e.getMessage());
            return false;
        }
    }
}
