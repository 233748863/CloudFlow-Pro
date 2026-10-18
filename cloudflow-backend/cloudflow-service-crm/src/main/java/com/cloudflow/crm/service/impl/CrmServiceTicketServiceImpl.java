package com.cloudflow.crm.service.impl;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmServiceTicket;
import com.cloudflow.crm.mapper.CrmServiceTicketMapper;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.cloudflow.crm.service.ICrmServiceTicketService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class CrmServiceTicketServiceImpl extends CrmServiceSupport<CrmServiceTicketMapper, CrmServiceTicket>
        implements ICrmServiceTicketService {
    private final ICrmCustomerService crmCustomerService;
    private final CrmSlaService slaService;
    private final CrmReferenceService references;

    @Override
    public PageResult<CrmServiceTicket> queryPage(CrmServiceTicket query, PageQuery pageQuery) {
        return PageResult.build(baseMapper.selectPageByDataScope(pageQuery.build(), query,
                DataScopeUtils.listScope("scope_dept_id", "scope_owner_id")));
    }

    @Override
    public CrmServiceTicket getAccessibleTicket(Long ticketId) {
        CrmRecordSupport.require(ticketId, "工单ID不能为空");
        return CrmRecordSupport.require(baseMapper.selectByIdWithDataScope(ticketId,
                DataScopeUtils.listScope("scope_dept_id", "scope_owner_id")), "工单不存在或无权访问");
    }

    @Override
    @Audit(name = "创建服务工单")
    @Transactional(rollbackFor = Exception.class)
    public boolean createTicket(CrmServiceTicket ticket) {
        CrmRecordSupport.require(ticket, "工单不能为空");
        CrmPortalTicketPolicy.protectCreate(ticket);
        CrmCustomer customer = crmCustomerService.getAccessibleCustomer(ticket.getCustomerId());
        CrmRecordSupport.create(ticket, "ticketId");
        ticket.setTicketNo(Localize.nextNo("GD")); ticket.setCustomerName(customer.getCustomerName());
        ticket.setTicketTitle(CrmRecordSupport.text(ticket.getTicketTitle(), 200, "工单标题"));
        ticket.setSeverity(CrmRecordSupport.code(ticket.getSeverity(), "P4", CrmSlaPriorityCatalog.CODES, "工单优先级"));
        ticket.setIssueType(CrmRecordSupport.code(ticket.getIssueType(), "OTHER", Set.of("OTHER", "PRODUCT", "SERVICE"), "问题类型"));
        ticket.setStatus("OPEN"); ticket.setResolvedTime(null);
        assignOwner(ticket, ticket.getOwnerId() == null ? UserContext.getUserId() : ticket.getOwnerId());
        if (ticket.getOpenedTime() == null) ticket.setOpenedTime(LocalDateTime.now());
        slaService.initialize(ticket);
        CrmRecordSupport.saved(baseMapper.insert(ticket));
        crmCustomerService.refreshHealth(ticket.getCustomerId());
        return true;
    }

    @Override
    @Audit(name = "更新服务工单与SLA", spel = "#request", diff = true)
    @Transactional(rollbackFor = Exception.class)
    public boolean updateTicket(CrmServiceTicket request) {
        CrmRecordSupport.require(request, "工单不能为空");
        CrmServiceTicket ticket = writable(request.getTicketId());
        CrmPortalTicketPolicy.protectUpdate(request, ticket);
        if (!Objects.equals(request.getVersion(), ticket.getVersion())) throw new IllegalArgumentException("工单已被修改，请刷新后重试");
        if (request.getCustomerId() != null && !Objects.equals(request.getCustomerId(), ticket.getCustomerId())) {
            throw new IllegalArgumentException("工单创建后不能改变所属客户");
        }
        String oldStatus = ticket.getStatus(); String oldSeverity = ticket.getSeverity();
        String status = CrmRecordSupport.code(request.getStatus(), oldStatus, CrmSlaPolicyService.TICKET_STATUSES, "工单状态");
        if ("CLOSED".equals(oldStatus) && !oldStatus.equals(status)) throw new IllegalArgumentException("已关闭工单不能重新打开");
        if ("RESOLVED".equals(oldStatus) && !Set.of("RESOLVED", "CLOSED").contains(status)) throw new IllegalArgumentException("已解决工单不能重新打开");
        boolean responded = !oldStatus.equals(status) || (request.getSolution() != null && !Objects.equals(ticket.getSolution(), request.getSolution()));
        if (request.getTicketTitle() != null) ticket.setTicketTitle(CrmRecordSupport.text(request.getTicketTitle(), 200, "工单标题"));
        ticket.setSeverity(CrmRecordSupport.code(request.getSeverity(), oldSeverity, CrmSlaPriorityCatalog.CODES, "工单优先级"));
        if (request.getIssueType() != null) ticket.setIssueType(CrmRecordSupport.code(request.getIssueType(), null, Set.of("OTHER", "PRODUCT", "SERVICE"), "问题类型"));
        if (request.getDescription() != null) ticket.setDescription(request.getDescription());
        if (request.getSolution() != null) ticket.setSolution(request.getSolution());
        if (request.getAttachmentUrl() != null) ticket.setAttachmentUrl(request.getAttachmentUrl());
        if (request.getOwnerId() != null && !request.getOwnerId().equals(ticket.getOwnerId())) assignOwner(ticket, request.getOwnerId());
        ticket.setStatus(status);
        slaService.change(ticket, oldStatus, oldSeverity, responded);
        if (Set.of("RESOLVED", "CLOSED").contains(status) && ticket.getResolvedTime() == null) ticket.setResolvedTime(LocalDateTime.now());
        return persist(ticket);
    }

    @Override
    @Audit(name = "解决CRM工单与SLA")
    @Transactional(rollbackFor = Exception.class)
    public boolean resolveTicket(Long ticketId, String solution) {
        CrmServiceTicket ticket = writable(ticketId);
        if ("CLOSED".equals(ticket.getStatus())) throw new IllegalArgumentException("工单已关闭");
        if ("RESOLVED".equals(ticket.getStatus())) return true;
        String oldStatus = ticket.getStatus(); ticket.setStatus("RESOLVED");
        if (solution != null) ticket.setSolution(solution);
        slaService.change(ticket, oldStatus, ticket.getSeverity(), true);
        if (ticket.getResolvedTime() == null) ticket.setResolvedTime(LocalDateTime.now());
        return persist(ticket);
    }

    @Override
    @Audit(name = "关闭CRM工单与SLA")
    @Transactional(rollbackFor = Exception.class)
    public boolean closeTicket(Long ticketId) {
        CrmServiceTicket ticket = writable(ticketId);
        if ("CLOSED".equals(ticket.getStatus())) return true;
        String oldStatus = ticket.getStatus(); ticket.setStatus("CLOSED");
        slaService.change(ticket, oldStatus, ticket.getSeverity(), true);
        if (ticket.getResolvedTime() == null) ticket.setResolvedTime(LocalDateTime.now());
        return persist(ticket);
    }

    @Override
    @Audit(name = "记录工单首次响应")
    @Transactional(rollbackFor = Exception.class)
    public boolean respondTicket(Long ticketId) {
        CrmServiceTicket ticket = writable(ticketId);
        if (ticket.getFirstResponseTime() != null) return true;
        slaService.change(ticket, ticket.getStatus(), ticket.getSeverity(), true);
        return persist(ticket);
    }

    private CrmServiceTicket writable(Long id) {
        CrmServiceTicket ticket = CrmRecordSupport.require(baseMapper.lockById(id), "工单不存在");
        getAccessibleTicket(id);
        CrmPortalTicketPolicy.requireAssigned(ticket);
        DataScopeUtils.assertOwnership(ticket, CrmServiceTicket::getOwnerId, "服务工单");
        return ticket;
    }

    private boolean persist(CrmServiceTicket ticket) {
        CrmRecordSupport.touch(ticket); CrmRecordSupport.saved(baseMapper.updateById(ticket));
        crmCustomerService.refreshHealth(ticket.getCustomerId()); return true;
    }

    private void assignOwner(CrmServiceTicket ticket, Long ownerId) {
        CrmRecordSupport.require(ownerId, "工单负责人不能为空");
        ticket.setOwnerId(ownerId);
        ticket.setOwnerName(Objects.equals(ownerId, UserContext.getUserId()) ? UserContext.getUserName() : references.user(ownerId).getEmployeeName());
    }
}
