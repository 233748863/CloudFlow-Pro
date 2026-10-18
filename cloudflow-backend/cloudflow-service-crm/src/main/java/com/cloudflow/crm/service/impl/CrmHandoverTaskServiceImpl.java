package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.crm.config.CrmEventStreamConstants;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmHandoverTask;
import com.cloudflow.crm.domain.CrmLead;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmQuote;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.CrmRenewal;
import com.cloudflow.crm.domain.CrmServiceTicket;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.mapper.CrmHandoverTaskMapper;
import com.cloudflow.crm.mapper.CrmLeadMapper;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.mapper.CrmQuoteMapper;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import com.cloudflow.crm.mapper.CrmRenewalMapper;
import com.cloudflow.crm.mapper.CrmServiceTicketMapper;
import com.cloudflow.crm.service.CrmEventPublisher;
import com.cloudflow.crm.service.ICrmHandoverTaskService;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.crm.service.deal.CrmDealHandoverService;
import com.cloudflow.crm.service.deal.CrmDealMemberResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class CrmHandoverTaskServiceImpl implements ICrmHandoverTaskService {

    private final CrmHandoverTaskMapper handoverTaskMapper;
    private final CrmLeadMapper leadMapper;
    private final CrmCustomerMapper customerMapper;
    private final CrmOpportunityMapper opportunityMapper;
    private final CrmQuoteMapper quoteMapper;
    private final CrmReceivableMapper receivableMapper;
    private final CrmRenewalMapper renewalMapper;
    private final CrmServiceTicketMapper serviceTicketMapper;
    private final CrmDealHandoverService dealHandover;
    private final CrmDealMemberResolver dealMembers;
    private final CrmEventPublisher crmEventPublisher;

    @Override
    @Audit(name = "处理离职客户业务交接")
    @Transactional(rollbackFor = Exception.class)
    public int generateForEmployeeLeft(Long tenantId, Long fromOwnerUserId, String fromOwnerName, Long fromDeptId,
                                       String eventId, Long successorUserId) {
        if (fromOwnerUserId == null) {
            return 0;
        }
        Long effectiveTenantId = resolveTenantId(tenantId);
        if (!java.util.Objects.equals(effectiveTenantId, CrmRecordSupport.tenantId())) throw new IllegalArgumentException("交接租户与当前身份不一致");
        if (java.util.Objects.equals(fromOwnerUserId, successorUserId)) throw new IllegalArgumentException("接任人不能与原负责人相同");
        if (successorUserId != null) {
            CrmHandoverTask completed = handoverTaskMapper.selectOne(new LambdaQueryWrapper<CrmHandoverTask>()
                    .eq(CrmHandoverTask::getTenantId, effectiveTenantId)
                    .eq(CrmHandoverTask::getBusinessType, "AUTO_REASSIGN")
                    .eq(CrmHandoverTask::getBusinessId, 0L)
                    .eq(CrmHandoverTask::getFromOwnerId, fromOwnerUserId)
                    .eq(CrmHandoverTask::getStatus, "REASSIGNED")
                    .eq(CrmHandoverTask::getDeleted, CrmConstants.DelFlag.NORMAL));
            if (completed != null) {
                if (!java.util.Objects.equals(successorUserId, completed.getToOwnerId())) {
                    throw new IllegalArgumentException("此离职交接已经完成，不能改为另一接任人");
                }
                return 0;
            }
        }
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
            if (!java.util.Objects.equals(fromOwnerUserId, handoverTaskMapper.lockBusinessOwner(effectiveTenantId, task.getBusinessType(), task.getBusinessId()))) continue;
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
        handoverTaskMapper.lockPendingByOwner(tenantId, fromOwnerUserId);
        CrmHandoverTask summary = buildTask(tenantId, "AUTO_REASSIGN", 0L, "employee-offboard-auto-reassign",
                fromOwnerUserId, fromOwnerName, fromDeptId, eventId);
        summary.setStatus("REASSIGNED");
        summary.setToOwnerId(successorUserId);
        summary.setToOwnerName(successorOwnerName);
        CrmRecordSupport.saved(handoverTaskMapper.insert(summary));
        int updated = 0;
        List<CrmCustomer> reassignedCustomers = customerMapper.selectList(new LambdaQueryWrapper<CrmCustomer>()
                .eq(CrmCustomer::getOwnerId, fromOwnerUserId)
                .eq(CrmCustomer::getDeleted, CrmConstants.DelFlag.NORMAL));
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
        publishCustomerOwnerChangedBatch(tenantId, reassignedCustomers, fromOwnerUserId, fromOwnerName,
                successorUserId, successorOwnerName, "AUTO_REASSIGN");
        for (CrmOpportunity opportunity : opportunityMapper.selectList(new LambdaQueryWrapper<CrmOpportunity>()
                .eq(CrmOpportunity::getOwnerId, fromOwnerUserId)
                .eq(CrmOpportunity::getDeleted, CrmConstants.DelFlag.NORMAL)
                .notIn(CrmOpportunity::getStage, CrmConstants.OpportunityStage.WON, CrmConstants.OpportunityStage.LOST)
                .orderByAsc(CrmOpportunity::getOpportunityId))) {
            updated += dealHandover.transfer("OPPORTUNITY", opportunity.getOpportunityId(), fromOwnerUserId, successorUserId);
        }
        for (CrmQuote quote : quoteMapper.selectList(new LambdaQueryWrapper<CrmQuote>()
                .eq(CrmQuote::getOwnerId, fromOwnerUserId)
                .eq(CrmQuote::getDeleted, CrmConstants.DelFlag.NORMAL)
                .notIn(CrmQuote::getStatus, CrmConstants.QuoteStatus.ACCEPTED, CrmConstants.QuoteStatus.EXPIRED)
                .orderByAsc(CrmQuote::getQuoteId))) {
            updated += dealHandover.transfer("QUOTE", quote.getQuoteId(), fromOwnerUserId, successorUserId);
        }
        for (CrmReceivable receivable : receivableMapper.selectList(new LambdaQueryWrapper<CrmReceivable>()
                .eq(CrmReceivable::getOwnerId, fromOwnerUserId)
                .eq(CrmReceivable::getDeleted, CrmConstants.DelFlag.NORMAL)
                .ne(CrmReceivable::getStatus, CrmConstants.ReceivableStatus.RECEIVED)
                .orderByAsc(CrmReceivable::getReceivableId))) {
            updated += dealHandover.transfer("RECEIVABLE", receivable.getReceivableId(), fromOwnerUserId, successorUserId);
        }
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

        for (CrmHandoverTask task : handoverTaskMapper.lockPendingByOwner(tenantId, fromOwnerUserId)) {
            if (!java.util.Objects.equals(successorUserId, businessOwner(task))) continue;
            task.setStatus("REASSIGNED");
            task.setToOwnerId(successorUserId);
            task.setToOwnerName(successorOwnerName);
            task.setRemark("离职自动交接已核对实际负责人，历史业绩不变");
            task.setUpdateBy("hr-employee-left");
            task.setUpdateTime(LocalDateTime.now());
            CrmRecordSupport.saved(handoverTaskMapper.updateById(task));
        }
        summary.setRemark("employee offboard auto reassign processed records=" + updated);
        CrmRecordSupport.saved(handoverTaskMapper.updateById(summary));
        log.info("employee offboard CRM auto-reassign completed, tenantId={}, fromUserId={}, toUserId={}, updated={}",
                tenantId, fromOwnerUserId, successorUserId, updated);
        return updated;
    }

    private Long businessOwner(CrmHandoverTask task) {
        return switch (task.getBusinessType()) {
            case "CRM_LEAD" -> {
                CrmLead record = leadMapper.selectById(task.getBusinessId());
                yield record != null && CrmConstants.DelFlag.NORMAL.equals(record.getDeleted()) ? record.getOwnerId() : null;
            }
            case "CRM_CUSTOMER" -> {
                CrmCustomer record = customerMapper.selectById(task.getBusinessId());
                yield record != null && CrmConstants.DelFlag.NORMAL.equals(record.getDeleted()) ? record.getOwnerId() : null;
            }
            case "CRM_OPPORTUNITY" -> {
                CrmOpportunity record = opportunityMapper.selectById(task.getBusinessId());
                yield record != null && CrmConstants.DelFlag.NORMAL.equals(record.getDeleted()) ? record.getOwnerId() : null;
            }
            case "CRM_QUOTE" -> {
                CrmQuote record = quoteMapper.selectById(task.getBusinessId());
                yield record != null && CrmConstants.DelFlag.NORMAL.equals(record.getDeleted()) ? record.getOwnerId() : null;
            }
            case "CRM_RECEIVABLE" -> {
                CrmReceivable record = receivableMapper.selectById(task.getBusinessId());
                yield record != null && CrmConstants.DelFlag.NORMAL.equals(record.getDeleted()) ? record.getOwnerId() : null;
            }
            case "CRM_RENEWAL" -> {
                CrmRenewal record = renewalMapper.selectById(task.getBusinessId());
                yield record != null && CrmConstants.DelFlag.NORMAL.equals(record.getDeleted()) ? record.getOwnerId() : null;
            }
            case "CRM_SERVICE_TICKET" -> {
                CrmServiceTicket record = serviceTicketMapper.selectById(task.getBusinessId());
                yield record != null && CrmConstants.DelFlag.NORMAL.equals(record.getDeleted()) ? record.getOwnerId() : null;
            }
            default -> null;
        };
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
    @Audit(name = "确认客户业务交接")
    @Transactional(rollbackFor = Exception.class)
    public int reassign(Long handoverId, Long toOwnerUserId, String toOwnerName, String remark) {
        if (handoverId == null || toOwnerUserId == null) {
            throw new IllegalArgumentException("handoverId and toOwnerUserId must not be null");
        }
        CrmHandoverTask task = handoverTaskMapper.lockById(handoverId);
        if (task == null || !CrmConstants.DelFlag.NORMAL.equals(task.getDeleted())) {
            throw new IllegalArgumentException("handover task not found");
        }
        if (!"PENDING".equals(task.getStatus())) {
            throw new IllegalArgumentException("only pending handover task can be reassigned");
        }
        if (!java.util.Objects.equals(task.getTenantId(), CrmRecordSupport.tenantId())) throw new IllegalArgumentException("交接任务不存在或无权访问");
        if (java.util.Objects.equals(task.getFromOwnerId(), toOwnerUserId)) throw new IllegalArgumentException("接任人不能与原负责人相同");
        String trustedOwnerName = resolveSuccessorName(toOwnerUserId);

        int updated = reassignBusinessOwner(task, toOwnerUserId, trustedOwnerName);
        if (updated <= 0) {
            throw new IllegalArgumentException("business object not found or already closed: " + task.getBusinessType());
        }

        task.setStatus("REASSIGNED");
        task.setToOwnerId(toOwnerUserId);
        task.setToOwnerName(trustedOwnerName);
        if (StringUtils.hasText(remark)) {
            task.setRemark(remark);
        }
        task.setUpdateTime(LocalDateTime.now());
        task.setUpdateBy("crm-handover");
        CrmRecordSupport.saved(handoverTaskMapper.updateById(task));
        return 1;
    }

    @Override
    @Audit(name = "关闭客户业务交接")
    @Transactional(rollbackFor = Exception.class)
    public int close(Long handoverId, String remark) {
        CrmHandoverTask task = handoverTaskMapper.lockById(handoverId);
        if (task == null || !CrmConstants.DelFlag.NORMAL.equals(task.getDeleted())) {
            throw new IllegalArgumentException("handover task not found");
        }
        if (!java.util.Objects.equals(task.getTenantId(), CrmRecordSupport.tenantId())) throw new IllegalArgumentException("交接任务不存在或无权访问");
        if (!"PENDING".equals(task.getStatus())) throw new IllegalArgumentException("只能关闭待处理交接任务");
        task.setStatus("CLOSED");
        if (StringUtils.hasText(remark)) {
            task.setRemark(remark);
        }
        task.setUpdateTime(LocalDateTime.now());
        task.setUpdateBy("crm-handover");
        CrmRecordSupport.saved(handoverTaskMapper.updateById(task));
        return 1;
    }

    private int reassignBusinessOwner(CrmHandoverTask task, Long toOwnerUserId, String toOwnerName) {
        String businessType = task.getBusinessType();
        LocalDateTime now = LocalDateTime.now();
        if ("CRM_LEAD".equals(businessType)) {
            return leadMapper.update(null, new LambdaUpdateWrapper<CrmLead>()
                    .eq(CrmLead::getLeadId, task.getBusinessId())
                    .eq(CrmLead::getOwnerId, task.getFromOwnerId())
                    .eq(CrmLead::getDeleted, CrmConstants.DelFlag.NORMAL)
                    .notIn(CrmLead::getStatus, CrmConstants.LeadStatus.CONVERTED, CrmConstants.LeadStatus.CLOSED)
                    .set(CrmLead::getOwnerId, toOwnerUserId)
                    .set(CrmLead::getOwnerName, toOwnerName)
                    .set(CrmLead::getUpdateTime, now)
                    .set(CrmLead::getUpdateBy, "crm-handover"));
        }
        if ("CRM_CUSTOMER".equals(businessType)) {
            int updated = customerMapper.update(null, new LambdaUpdateWrapper<CrmCustomer>()
                    .eq(CrmCustomer::getCustomerId, task.getBusinessId())
                    .eq(CrmCustomer::getOwnerId, task.getFromOwnerId())
                    .eq(CrmCustomer::getDeleted, CrmConstants.DelFlag.NORMAL)
                    .set(CrmCustomer::getOwnerId, toOwnerUserId)
                    .set(CrmCustomer::getOwnerName, toOwnerName)
                    .set(CrmCustomer::getUpdateTime, now)
                    .set(CrmCustomer::getUpdateBy, "crm-handover"));
            if (updated > 0) {
                publishCustomerOwnerChanged(task.getTenantId(), task.getBusinessId(), task.getBusinessName(),
                        task.getFromOwnerId(), task.getFromOwnerName(), toOwnerUserId, toOwnerName, "HANDOVER");
            }
            return updated;
        }
        if ("CRM_OPPORTUNITY".equals(businessType)) return dealHandover.transfer("OPPORTUNITY", task.getBusinessId(), task.getFromOwnerId(), toOwnerUserId);
        if ("CRM_QUOTE".equals(businessType)) return dealHandover.transfer("QUOTE", task.getBusinessId(), task.getFromOwnerId(), toOwnerUserId);
        if ("CRM_RECEIVABLE".equals(businessType)) return dealHandover.transfer("RECEIVABLE", task.getBusinessId(), task.getFromOwnerId(), toOwnerUserId);
        if ("CRM_RENEWAL".equals(businessType)) {
            return renewalMapper.update(null, new LambdaUpdateWrapper<CrmRenewal>()
                    .eq(CrmRenewal::getRenewalId, task.getBusinessId())
                    .eq(CrmRenewal::getOwnerId, task.getFromOwnerId())
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
                    .eq(CrmServiceTicket::getOwnerId, task.getFromOwnerId())
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
        return dealMembers.resolve(List.of(new CrmDealMemberResolver.Assignment(successorUserId, "OWNER", java.math.BigDecimal.ONE, null))).owner().name();
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
        throw new IllegalArgumentException("tenantId不能为空");
    }

    private void publishCustomerOwnerChangedBatch(Long tenantId, List<CrmCustomer> customers,
                                                  Long fromOwnerId, String fromOwnerName,
                                                  Long toOwnerId, String toOwnerName, String action) {
        if (customers == null || customers.isEmpty()) {
            return;
        }
        for (CrmCustomer customer : customers) {
            publishCustomerOwnerChanged(resolveTenantId(customer.getTenantId() != null ? customer.getTenantId() : tenantId),
                    customer.getCustomerId(), customer.getCustomerName(), fromOwnerId, fromOwnerName, toOwnerId, toOwnerName, action);
        }
    }

    private void publishCustomerOwnerChanged(Long tenantId, Long customerId, String customerName,
                                             Long fromOwnerId, String fromOwnerName,
                                             Long toOwnerId, String toOwnerName, String action) {
        if (customerId == null) {
            return;
        }
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("customerId", customerId);
        fields.put("customerName", customerName);
        fields.put("action", action);
        fields.put("fromOwnerId", fromOwnerId);
        fields.put("fromOwnerName", fromOwnerName);
        fields.put("toOwnerId", toOwnerId);
        fields.put("toOwnerName", toOwnerName);
        crmEventPublisher.publish(CrmEventStreamConstants.EVENT_CUSTOMER_OWNER_CHANGED,
                resolveTenantId(tenantId), fields);
    }
}
