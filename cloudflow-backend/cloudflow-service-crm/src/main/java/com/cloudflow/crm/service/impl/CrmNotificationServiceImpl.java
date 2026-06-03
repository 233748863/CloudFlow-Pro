package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.CrmServiceTicket;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import com.cloudflow.crm.mapper.CrmServiceTicketMapper;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.cloudflow.crm.service.ICrmNotificationService;
import com.cloudflow.crm.service.remote.RemoteOaService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Slf4j
@Service
public class CrmNotificationServiceImpl implements ICrmNotificationService {

    private final CrmCustomerMapper customerMapper;
    private final CrmReceivableMapper receivableMapper;
    private final CrmOpportunityMapper opportunityMapper;
    private final CrmServiceTicketMapper serviceTicketMapper;
    private final ICrmCustomerService crmCustomerService;
    private final RemoteOaService remoteOaService;
    private final TenantIterator tenantIterator;

    @Value("${cloudflow.crm.notification.follow-up-inactive-days:14}")
    private int followUpInactiveDays;

    @Value("${cloudflow.crm.notification.receivable-look-ahead-days:7}")
    private int receivableLookAheadDays;

    @Value("${cloudflow.crm.notification.opportunity-stalled-days:14}")
    private int opportunityStalledDays;

    @Value("${cloudflow.crm.notification.ticket-sla-reminder-hours:2}")
    private int ticketSlaReminderHours;

    public CrmNotificationServiceImpl(CrmCustomerMapper customerMapper,
                                      CrmReceivableMapper receivableMapper,
                                      CrmOpportunityMapper opportunityMapper,
                                      CrmServiceTicketMapper serviceTicketMapper,
                                      ICrmCustomerService crmCustomerService,
                                      RemoteOaService remoteOaService,
                                      TenantIterator tenantIterator) {
        this.customerMapper = customerMapper;
        this.receivableMapper = receivableMapper;
        this.opportunityMapper = opportunityMapper;
        this.serviceTicketMapper = serviceTicketMapper;
        this.crmCustomerService = crmCustomerService;
        this.remoteOaService = remoteOaService;
        this.tenantIterator = tenantIterator;
    }

    /** 每天 09:00 触发跟进逾期 / 回款到期 / 商机停滞通知。 */
    @Scheduled(cron = "0 0 9 * * ?")
    public void scheduledDispatch() {
        log.info("CRM notification scheduled dispatch start");
        java.util.concurrent.atomic.AtomicInteger total = new java.util.concurrent.atomic.AtomicInteger();
        tenantIterator.forEachActiveTenant(tid -> {
            try {
                total.addAndGet(dispatchFollowUpOverdue() + dispatchReceivableDue() + dispatchStalledOpportunity());
            } catch (Exception e) {
                log.error("CRM notification dispatch failed, tenantId={}", tid, e);
            }
        });
        log.info("CRM notification scheduled dispatch end, published={}", total.get());
    }

    /** 每小时扫描一次即将到期 / 已超时工单，避免日级任务错过 SLA 窗口。 */
    @Scheduled(cron = "${cloudflow.crm.notification.ticket-sla-cron:0 0 * * * ?}")
    public void scheduledTicketSlaDispatch() {
        log.info("CRM ticket SLA notification dispatch start");
        java.util.concurrent.atomic.AtomicInteger total = new java.util.concurrent.atomic.AtomicInteger();
        tenantIterator.forEachActiveTenant(tid -> {
            try {
                total.addAndGet(dispatchTicketSlaDue());
            } catch (Exception e) {
                log.error("CRM ticket SLA dispatch failed, tenantId={}", tid, e);
            }
        });
        log.info("CRM ticket SLA notification dispatch end, published={}", total.get());
    }

    @Override
    public int dispatchAll() {
        return dispatchFollowUpOverdue()
                + dispatchReceivableDue()
                + dispatchStalledOpportunity()
                + dispatchTicketSlaDue();
    }

    @Override
    public int dispatchFollowUpOverdue() {
        LocalDateTime threshold = LocalDateTime.now().minusDays(followUpInactiveDays);
        List<CrmCustomer> rows = customerMapper.selectList(new LambdaQueryWrapper<CrmCustomer>()
                .eq(CrmCustomer::getDeleted, CrmConstants.DelFlag.NORMAL)
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
                .eq(CrmReceivable::getDeleted, CrmConstants.DelFlag.NORMAL)
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
                .eq(CrmOpportunity::getDeleted, CrmConstants.DelFlag.NORMAL)
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

    @Override
    public int dispatchTicketSlaDue() {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime reminderWindow = now.plusHours(ticketSlaReminderHours);
        List<CrmServiceTicket> rows = serviceTicketMapper.selectList(new LambdaQueryWrapper<CrmServiceTicket>()
                .eq(CrmServiceTicket::getDeleted, CrmConstants.DelFlag.NORMAL)
                .isNotNull(CrmServiceTicket::getOwnerId)
                .isNotNull(CrmServiceTicket::getDueTime)
                .le(CrmServiceTicket::getDueTime, reminderWindow)
                .notIn(CrmServiceTicket::getStatus,
                        CrmConstants.TicketStatus.RESOLVED,
                        CrmConstants.TicketStatus.CLOSED));
        int count = 0;
        Set<Long> refreshedCustomerIds = new HashSet<>();
        for (CrmServiceTicket ticket : rows) {
            boolean overdue = ticket.getDueTime().isBefore(now);
            String title = (overdue ? "工单SLA已超时：" : "工单SLA即将到期：") + ticket.getTicketTitle();
            String content = String.format("客户【%s】工单【%s】严重度【%s】，SLA截止时间 %s，当前状态 %s。",
                    ticket.getCustomerName(),
                    ticket.getTicketTitle(),
                    ticket.getSeverity(),
                    ticket.getDueTime(),
                    ticket.getStatus());
            String priority = overdue
                    || CrmConstants.TicketSeverity.HIGH.equalsIgnoreCase(ticket.getSeverity())
                    || CrmConstants.TicketSeverity.CRITICAL.equalsIgnoreCase(ticket.getSeverity())
                    ? "H" : "M";
            if (publish(title, content, overdue ? "3" : "1", priority, ticket.getTenantId(), ticket.getOwnerId())) {
                count++;
            }
            if (ticket.getCustomerId() != null && refreshedCustomerIds.add(ticket.getCustomerId())) {
                crmCustomerService.refreshHealth(ticket.getCustomerId());
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
