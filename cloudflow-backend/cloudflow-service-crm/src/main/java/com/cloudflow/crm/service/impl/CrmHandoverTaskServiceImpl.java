package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmHandoverTask;
import com.cloudflow.crm.domain.CrmLead;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmQuote;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.CrmRenewal;
import com.cloudflow.crm.domain.CrmServiceTicket;
import com.cloudflow.crm.domain.vo.HrEmployeeSummaryVO;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.mapper.CrmHandoverTaskMapper;
import com.cloudflow.crm.mapper.CrmLeadMapper;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.mapper.CrmQuoteMapper;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import com.cloudflow.crm.mapper.CrmRenewalMapper;
import com.cloudflow.crm.mapper.CrmServiceTicketMapper;
import com.cloudflow.crm.service.ICrmHandoverTaskService;
import com.cloudflow.crm.service.remote.RemoteHrService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class CrmHandoverTaskServiceImpl implements ICrmHandoverTaskService {

    private static final Long FALLBACK_TENANT_ID = 100000L;

    private final CrmHandoverTaskMapper handoverTaskMapper;
    private final CrmLeadMapper leadMapper;
    private final CrmCustomerMapper customerMapper;
    private final CrmOpportunityMapper opportunityMapper;
    private final CrmQuoteMapper quoteMapper;
    private final CrmReceivableMapper receivableMapper;
    private final CrmRenewalMapper renewalMapper;
    private final CrmServiceTicketMapper serviceTicketMapper;
    private final RemoteHrService remoteHrService;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int generateForEmployeeLeft(Long tenantId, Long fromOwnerUserId, String fromOwnerName, Long fromDeptId,
                                       String eventId, Long successorUserId) {
        if (fromOwnerUserId == null) {
            return 0;
        }
        Long effectiveTenantId = resolveTenantId(tenantId);
        String successorOwnerName = resolveSuccessorName(successorUserId);
        if (successorUserId != null && StringUtils.hasText(successorOwnerName)) {
            return autoReassignAll(effectiveTenantId, fromOwnerUserId, fromOwnerName, fromDeptId, eventId,
                    successorUserId, successorOwnerName);
        }

        List<CrmHandoverTask> pending = new ArrayList<>();

        List<CrmLead> leads = leadMapper.selectList(new LambdaQueryWrapper<CrmLead>()
                .eq(CrmLead::getDeleted, CrmConstants.DelFlag.NORMAL)
                .eq(CrmLead::getOwnerId, fromOwnerUserId)
                .notIn(CrmLead::getStatus, CrmConstants.LeadStatus.CONVERTED, CrmConstants.LeadStatus.CLOSED));
        for (CrmLead lead : leads) {
            pending.add(buildTask(effectiveTenantId, "CRM_LEAD", lead.getLeadId(), lead.getLeadName(),
                    fromOwnerUserId, fromOwnerName, fromDeptId, eventId));
        }

        List<CrmCustomer> customers = customerMapper.selectList(new LambdaQueryWrapper<CrmCustomer>()
                .eq(CrmCustomer::getDeleted, CrmConstants.DelFlag.NORMAL)
                .eq(CrmCustomer::getOwnerId, fromOwnerUserId));
        for (CrmCustomer customer : customers) {
            pending.add(buildTask(effectiveTenantId, "CRM_CUSTOMER", customer.getCustomerId(), customer.getCustomerName(),
                    fromOwnerUserId, fromOwnerName, fromDeptId, eventId));
        }

        List<CrmOpportunity> opportunities = opportunityMapper.selectList(new LambdaQueryWrapper<CrmOpportunity>()
                .eq(CrmOpportunity::getDeleted, CrmConstants.DelFlag.NORMAL)
                .eq(CrmOpportunity::getOwnerId, fromOwnerUserId)
                .notIn(CrmOpportunity::getStage, CrmConstants.OpportunityStage.WON, CrmConstants.OpportunityStage.LOST));
        for (CrmOpportunity opportunity : opportunities) {
            pending.add(buildTask(effectiveTenantId, "CRM_OPPORTUNITY", opportunity.getOpportunityId(), opportunity.getOpportunityName(),
                    fromOwnerUserId, fromOwnerName, fromDeptId, eventId));
        }

        List<CrmQuote> quotes = quoteMapper.selectList(new LambdaQueryWrapper<CrmQuote>()
                .eq(CrmQuote::getDeleted, CrmConstants.DelFlag.NORMAL)
                .eq(CrmQuote::getOwnerId, fromOwnerUserId)
                .notIn(CrmQuote::getStatus, CrmConstants.QuoteStatus.ACCEPTED, CrmConstants.QuoteStatus.EXPIRED));
        for (CrmQuote quote : quotes) {
            pending.add(buildTask(effectiveTenantId, "CRM_QUOTE", quote.getQuoteId(), quote.getQuoteName(),
                    fromOwnerUserId, fromOwnerName, fromDeptId, eventId));
        }

        List<CrmReceivable> receivables = receivableMapper.selectList(new LambdaQueryWrapper<CrmReceivable>()
                .eq(CrmReceivable::getDeleted, CrmConstants.DelFlag.NORMAL)
                .eq(CrmReceivable::getOwnerId, fromOwnerUserId)
                .ne(CrmReceivable::getStatus, CrmConstants.ReceivableStatus.RECEIVED));
        for (CrmReceivable receivable : receivables) {
            pending.add(buildTask(effectiveTenantId, "CRM_RECEIVABLE", receivable.getReceivableId(), receivable.getReceivableName(),
                    fromOwnerUserId, fromOwnerName, fromDeptId, eventId));
        }

        List<CrmRenewal> renewals = renewalMapper.selectList(new LambdaQueryWrapper<CrmRenewal>()
                .eq(CrmRenewal::getDeleted, CrmConstants.DelFlag.NORMAL)
                .eq(CrmRenewal::getOwnerId, fromOwnerUserId)
                .notIn(CrmRenewal::getStatus,
                        CrmConstants.RenewalStatus.WON,
                        CrmConstants.RenewalStatus.LOST,
                        CrmConstants.RenewalStatus.CLOSED));
        for (CrmRenewal renewal : renewals) {
            pending.add(buildTask(effectiveTenantId, "CRM_RENEWAL", renewal.getRenewalId(), renewal.getRenewalName(),
                    fromOwnerUserId, fromOwnerName, fromDeptId, eventId));
        }

        List<CrmServiceTicket> tickets = serviceTicketMapper.selectList(new LambdaQueryWrapper<CrmServiceTicket>()
                .eq(CrmServiceTicket::getDeleted, CrmConstants.DelFlag.NORMAL)
                .eq(CrmServiceTicket::getOwnerId, fromOwnerUserId)
                .notIn(CrmServiceTicket::getStatus, CrmConstants.TicketStatus.RESOLVED, CrmConstants.TicketStatus.CLOSED));
        for (CrmServiceTicket ticket : tickets) {
            pending.add(buildTask(effectiveTenantId, "CRM_SERVICE_TICKET", ticket.getTicketId(), ticket.getTicketTitle(),
                    fromOwnerUserId, fromOwnerName, fromDeptId, eventId));
        }

        int created = 0;
        for (CrmHandoverTask task : pending) {
            if (existsPending(task.getBusinessType(), task.getBusinessId(), task.getFromOwnerId())) {
                continue;
            }
            handoverTaskMapper.insert(task);
            created++;
        }

        log.info("employee offboard CRM handover generated, tenantId={}, userId={}, lead={}, customer={}, opportunity={}, quote={}, receivable={}, renewal={}, ticket={}, created={}",
                effectiveTenantId, fromOwnerUserId, leads.size(), customers.size(), opportunities.size(),
                quotes.size(), receivables.size(), renewals.size(), tickets.size(), created);
        return created;
    }

    private int autoReassignAll(Long tenantId, Long fromOwnerUserId, String fromOwnerName, Long fromDeptId,
                                String eventId, Long successorUserId, String successorOwnerName) {
        int updated = 0;
        updated += updateOwner(leadMapper, new LambdaUpdateWrapper<CrmLead>()
                .eq(CrmLead::getOwnerId, fromOwnerUserId)
                .eq(CrmLead::getDeleted, CrmConstants.DelFlag.NORMAL)
                .notIn(CrmLead::getStatus, CrmConstants.LeadStatus.CONVERTED, CrmConstants.LeadStatus.CLOSED)
                .set(CrmLead::getOwnerId, successorUserId)
                .set(CrmLead::getOwnerName, successorOwnerName)
                .set(CrmLead::getUpdateTime, LocalDateTime.now())
                .set(CrmLead::getUpdateBy, "hr-employee-left"));
        updated += updateOwner(customerMapper, new LambdaUpdateWrapper<CrmCustomer>()
                .eq(CrmCustomer::getOwnerId, fromOwnerUserId)
                .eq(CrmCustomer::getDeleted, CrmConstants.DelFlag.NORMAL)
                .set(CrmCustomer::getOwnerId, successorUserId)
                .set(CrmCustomer::getOwnerName, successorOwnerName)
                .set(CrmCustomer::getUpdateTime, LocalDateTime.now())
                .set(CrmCustomer::getUpdateBy, "hr-employee-left"));
        updated += updateOwner(opportunityMapper, new LambdaUpdateWrapper<CrmOpportunity>()
                .eq(CrmOpportunity::getOwnerId, fromOwnerUserId)
                .eq(CrmOpportunity::getDeleted, CrmConstants.DelFlag.NORMAL)
                .notIn(CrmOpportunity::getStage, CrmConstants.OpportunityStage.WON, CrmConstants.OpportunityStage.LOST)
                .set(CrmOpportunity::getOwnerId, successorUserId)
                .set(CrmOpportunity::getOwnerName, successorOwnerName)
                .set(CrmOpportunity::getUpdateTime, LocalDateTime.now())
                .set(CrmOpportunity::getUpdateBy, "hr-employee-left"));
        updated += updateOwner(quoteMapper, new LambdaUpdateWrapper<CrmQuote>()
                .eq(CrmQuote::getOwnerId, fromOwnerUserId)
                .eq(CrmQuote::getDeleted, CrmConstants.DelFlag.NORMAL)
                .notIn(CrmQuote::getStatus, CrmConstants.QuoteStatus.ACCEPTED, CrmConstants.QuoteStatus.EXPIRED)
                .set(CrmQuote::getOwnerId, successorUserId)
                .set(CrmQuote::getOwnerName, successorOwnerName)
                .set(CrmQuote::getUpdateTime, LocalDateTime.now())
                .set(CrmQuote::getUpdateBy, "hr-employee-left"));
        updated += updateOwner(receivableMapper, new LambdaUpdateWrapper<CrmReceivable>()
                .eq(CrmReceivable::getOwnerId, fromOwnerUserId)
                .eq(CrmReceivable::getDeleted, CrmConstants.DelFlag.NORMAL)
                .ne(CrmReceivable::getStatus, CrmConstants.ReceivableStatus.RECEIVED)
                .set(CrmReceivable::getOwnerId, successorUserId)
                .set(CrmReceivable::getOwnerName, successorOwnerName)
                .set(CrmReceivable::getUpdateTime, LocalDateTime.now())
                .set(CrmReceivable::getUpdateBy, "hr-employee-left"));
        updated += updateOwner(renewalMapper, new LambdaUpdateWrapper<CrmRenewal>()
                .eq(CrmRenewal::getOwnerId, fromOwnerUserId)
                .eq(CrmRenewal::getDeleted, CrmConstants.DelFlag.NORMAL)
                .notIn(CrmRenewal::getStatus,
                        CrmConstants.RenewalStatus.WON,
                        CrmConstants.RenewalStatus.LOST,
                        CrmConstants.RenewalStatus.CLOSED)
                .set(CrmRenewal::getOwnerId, successorUserId)
                .set(CrmRenewal::getOwnerName, successorOwnerName)
                .set(CrmRenewal::getUpdateTime, LocalDateTime.now())
                .set(CrmRenewal::getUpdateBy, "hr-employee-left"));
        updated += updateOwner(serviceTicketMapper, new LambdaUpdateWrapper<CrmServiceTicket>()
                .eq(CrmServiceTicket::getOwnerId, fromOwnerUserId)
                .eq(CrmServiceTicket::getDeleted, CrmConstants.DelFlag.NORMAL)
                .notIn(CrmServiceTicket::getStatus, CrmConstants.TicketStatus.RESOLVED, CrmConstants.TicketStatus.CLOSED)
                .set(CrmServiceTicket::getOwnerId, successorUserId)
                .set(CrmServiceTicket::getOwnerName, successorOwnerName)
                .set(CrmServiceTicket::getUpdateTime, LocalDateTime.now())
                .set(CrmServiceTicket::getUpdateBy, "hr-employee-left"));

        CrmHandoverTask task = buildTask(tenantId, "AUTO_REASSIGN", 0L, "employee-offboard-auto-reassign",
                fromOwnerUserId, fromOwnerName, fromDeptId, eventId);
        task.setStatus("REASSIGNED");
        task.setToOwnerId(successorUserId);
        task.setToOwnerName(successorOwnerName);
        task.setRemark("employee offboard auto reassign processed records=" + updated);
        handoverTaskMapper.insert(task);
        log.info("employee offboard CRM auto-reassign completed, tenantId={}, fromUserId={}, toUserId={}, updated={}",
                tenantId, fromOwnerUserId, successorUserId, updated);
        return updated;
    }

    @Override
    public List<CrmHandoverTask> listPending(Long fromOwnerId) {
        LambdaQueryWrapper<CrmHandoverTask> wrapper = new LambdaQueryWrapper<CrmHandoverTask>()
                .eq(CrmHandoverTask::getDeleted, CrmConstants.DelFlag.NORMAL)
                .eq(CrmHandoverTask::getStatus, "PENDING")
                .orderByDesc(CrmHandoverTask::getCreateTime);
        if (fromOwnerId != null) {
            wrapper.eq(CrmHandoverTask::getFromOwnerId, fromOwnerId);
        }
        return handoverTaskMapper.selectList(wrapper);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int reassign(Long handoverId, Long toOwnerUserId, String toOwnerName, String remark) {
        if (handoverId == null || toOwnerUserId == null) {
            throw new IllegalArgumentException("handoverId and toOwnerUserId must not be null");
        }
        CrmHandoverTask task = handoverTaskMapper.selectById(handoverId);
        if (task == null || !CrmConstants.DelFlag.NORMAL.equals(task.getDeleted())) {
            throw new IllegalArgumentException("handover task not found");
        }
        if (!"PENDING".equals(task.getStatus())) {
            throw new IllegalArgumentException("only pending handover task can be reassigned");
        }

        int updated = reassignBusinessOwner(task, toOwnerUserId, toOwnerName);
        if (updated <= 0) {
            throw new IllegalArgumentException("business object not found or already closed: " + task.getBusinessType());
        }

        task.setStatus("REASSIGNED");
        task.setToOwnerId(toOwnerUserId);
        task.setToOwnerName(toOwnerName);
        if (StringUtils.hasText(remark)) {
            task.setRemark(remark);
        }
        task.setUpdateTime(LocalDateTime.now());
        task.setUpdateBy("crm-handover");
        return handoverTaskMapper.updateById(task);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int close(Long handoverId, String remark) {
        CrmHandoverTask task = handoverTaskMapper.selectById(handoverId);
        if (task == null || !CrmConstants.DelFlag.NORMAL.equals(task.getDeleted())) {
            throw new IllegalArgumentException("handover task not found");
        }
        task.setStatus("CLOSED");
        if (StringUtils.hasText(remark)) {
            task.setRemark(remark);
        }
        task.setUpdateTime(LocalDateTime.now());
        task.setUpdateBy("crm-handover");
        return handoverTaskMapper.updateById(task);
    }

    private int reassignBusinessOwner(CrmHandoverTask task, Long toOwnerUserId, String toOwnerName) {
        String businessType = task.getBusinessType();
        LocalDateTime now = LocalDateTime.now();
        if ("CRM_LEAD".equals(businessType)) {
            return leadMapper.update(null, new LambdaUpdateWrapper<CrmLead>()
                    .eq(CrmLead::getLeadId, task.getBusinessId())
                    .eq(CrmLead::getDeleted, CrmConstants.DelFlag.NORMAL)
                    .notIn(CrmLead::getStatus, CrmConstants.LeadStatus.CONVERTED, CrmConstants.LeadStatus.CLOSED)
                    .set(CrmLead::getOwnerId, toOwnerUserId)
                    .set(CrmLead::getOwnerName, toOwnerName)
                    .set(CrmLead::getUpdateTime, now)
                    .set(CrmLead::getUpdateBy, "crm-handover"));
        }
        if ("CRM_CUSTOMER".equals(businessType)) {
            return customerMapper.update(null, new LambdaUpdateWrapper<CrmCustomer>()
                    .eq(CrmCustomer::getCustomerId, task.getBusinessId())
                    .eq(CrmCustomer::getDeleted, CrmConstants.DelFlag.NORMAL)
                    .set(CrmCustomer::getOwnerId, toOwnerUserId)
                    .set(CrmCustomer::getOwnerName, toOwnerName)
                    .set(CrmCustomer::getUpdateTime, now)
                    .set(CrmCustomer::getUpdateBy, "crm-handover"));
        }
        if ("CRM_OPPORTUNITY".equals(businessType)) {
            return opportunityMapper.update(null, new LambdaUpdateWrapper<CrmOpportunity>()
                    .eq(CrmOpportunity::getOpportunityId, task.getBusinessId())
                    .eq(CrmOpportunity::getDeleted, CrmConstants.DelFlag.NORMAL)
                    .notIn(CrmOpportunity::getStage, CrmConstants.OpportunityStage.WON, CrmConstants.OpportunityStage.LOST)
                    .set(CrmOpportunity::getOwnerId, toOwnerUserId)
                    .set(CrmOpportunity::getOwnerName, toOwnerName)
                    .set(CrmOpportunity::getUpdateTime, now)
                    .set(CrmOpportunity::getUpdateBy, "crm-handover"));
        }
        if ("CRM_QUOTE".equals(businessType)) {
            return quoteMapper.update(null, new LambdaUpdateWrapper<CrmQuote>()
                    .eq(CrmQuote::getQuoteId, task.getBusinessId())
                    .eq(CrmQuote::getDeleted, CrmConstants.DelFlag.NORMAL)
                    .notIn(CrmQuote::getStatus, CrmConstants.QuoteStatus.ACCEPTED, CrmConstants.QuoteStatus.EXPIRED)
                    .set(CrmQuote::getOwnerId, toOwnerUserId)
                    .set(CrmQuote::getOwnerName, toOwnerName)
                    .set(CrmQuote::getUpdateTime, now)
                    .set(CrmQuote::getUpdateBy, "crm-handover"));
        }
        if ("CRM_RECEIVABLE".equals(businessType)) {
            return receivableMapper.update(null, new LambdaUpdateWrapper<CrmReceivable>()
                    .eq(CrmReceivable::getReceivableId, task.getBusinessId())
                    .eq(CrmReceivable::getDeleted, CrmConstants.DelFlag.NORMAL)
                    .ne(CrmReceivable::getStatus, CrmConstants.ReceivableStatus.RECEIVED)
                    .set(CrmReceivable::getOwnerId, toOwnerUserId)
                    .set(CrmReceivable::getOwnerName, toOwnerName)
                    .set(CrmReceivable::getUpdateTime, now)
                    .set(CrmReceivable::getUpdateBy, "crm-handover"));
        }
        if ("CRM_RENEWAL".equals(businessType)) {
            return renewalMapper.update(null, new LambdaUpdateWrapper<CrmRenewal>()
                    .eq(CrmRenewal::getRenewalId, task.getBusinessId())
                    .eq(CrmRenewal::getDeleted, CrmConstants.DelFlag.NORMAL)
                    .notIn(CrmRenewal::getStatus,
                            CrmConstants.RenewalStatus.WON,
                            CrmConstants.RenewalStatus.LOST,
                            CrmConstants.RenewalStatus.CLOSED)
                    .set(CrmRenewal::getOwnerId, toOwnerUserId)
                    .set(CrmRenewal::getOwnerName, toOwnerName)
                    .set(CrmRenewal::getUpdateTime, now)
                    .set(CrmRenewal::getUpdateBy, "crm-handover"));
        }
        if ("CRM_SERVICE_TICKET".equals(businessType)) {
            return serviceTicketMapper.update(null, new LambdaUpdateWrapper<CrmServiceTicket>()
                    .eq(CrmServiceTicket::getTicketId, task.getBusinessId())
                    .eq(CrmServiceTicket::getDeleted, CrmConstants.DelFlag.NORMAL)
                    .notIn(CrmServiceTicket::getStatus, CrmConstants.TicketStatus.RESOLVED, CrmConstants.TicketStatus.CLOSED)
                    .set(CrmServiceTicket::getOwnerId, toOwnerUserId)
                    .set(CrmServiceTicket::getOwnerName, toOwnerName)
                    .set(CrmServiceTicket::getUpdateTime, now)
                    .set(CrmServiceTicket::getUpdateBy, "crm-handover"));
        }
        throw new IllegalArgumentException("unsupported businessType: " + businessType);
    }

    private boolean existsPending(String businessType, Long businessId, Long fromOwnerId) {
        return handoverTaskMapper.selectCount(new LambdaQueryWrapper<CrmHandoverTask>()
                .eq(CrmHandoverTask::getBusinessType, businessType)
                .eq(CrmHandoverTask::getBusinessId, businessId)
                .eq(CrmHandoverTask::getFromOwnerId, fromOwnerId)
                .eq(CrmHandoverTask::getStatus, "PENDING")
                .eq(CrmHandoverTask::getDeleted, CrmConstants.DelFlag.NORMAL)) > 0;
    }

    private <T> int updateOwner(com.baomidou.mybatisplus.core.mapper.BaseMapper<T> mapper,
                                LambdaUpdateWrapper<T> wrapper) {
        return mapper.update(null, wrapper);
    }

    private String resolveSuccessorName(Long successorUserId) {
        if (successorUserId == null) {
            return null;
        }
        try {
            HrEmployeeSummaryVO employee = remoteHrService.getEmployeeByUserId(successorUserId).getData();
            return employee == null ? null : employee.getEmployeeName();
        } catch (Exception ex) {
            log.warn("resolve successor name failed, successorUserId={}", successorUserId, ex);
            return null;
        }
    }

    private CrmHandoverTask buildTask(Long tenantId, String businessType, Long businessId, String businessName,
                                      Long fromOwnerId, String fromOwnerName, Long fromDeptId, String eventId) {
        CrmHandoverTask task = new CrmHandoverTask();
        task.setTenantId(resolveTenantId(tenantId));
        task.setFromOwnerId(fromOwnerId);
        task.setFromOwnerName(fromOwnerName);
        task.setFromDeptId(fromDeptId);
        task.setBusinessType(businessType);
        task.setBusinessId(businessId);
        task.setBusinessName(businessName);
        task.setStatus("PENDING");
        task.setTriggerSource("EMPLOYEE_LEFT");
        task.setTriggerEventId(eventId);
        task.setDeleted(CrmConstants.DelFlag.NORMAL);
        task.setCreateBy("hr-employee-left");
        task.setUpdateBy("hr-employee-left");
        return task;
    }

    private Long resolveTenantId(Long tenantId) {
        if (tenantId != null) {
            return tenantId;
        }
        Long contextTenantId = UserContext.getTenantId();
        if (contextTenantId != null) {
            return contextTenantId;
        }
        return FALLBACK_TENANT_ID;
    }
}
