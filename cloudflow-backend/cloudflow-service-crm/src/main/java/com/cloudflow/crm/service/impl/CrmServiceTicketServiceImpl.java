package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmServiceTicket;
import com.cloudflow.crm.mapper.CrmServiceTicketMapper;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.cloudflow.crm.service.ICrmServiceTicketService;
import com.cloudflow.common.audit.annotation.Audit;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
public class CrmServiceTicketServiceImpl extends CrmServiceSupport<CrmServiceTicketMapper, CrmServiceTicket>
        implements ICrmServiceTicketService {

    private static final String SCOPE_DEPT_COLUMN = "scope_dept_id";
    private static final String SCOPE_OWNER_COLUMN = "scope_owner_id";

    private final ICrmCustomerService crmCustomerService;

    @Override
    public PageResult<CrmServiceTicket> queryPage(CrmServiceTicket query, PageQuery pageQuery) {
        return PageResult.build(baseMapper.selectPageByDataScope(
                pageQuery.build(),
                query,
                DataScopeUtils.listScope(SCOPE_DEPT_COLUMN, SCOPE_OWNER_COLUMN)));
    }

    @Override
    public CrmServiceTicket getAccessibleTicket(Long ticketId) {
        if (ticketId == null) {
            throw new IllegalArgumentException("工单ID不能为空");
        }
        CrmServiceTicket ticket = baseMapper.selectByIdWithDataScope(
                ticketId,
                DataScopeUtils.listScope(SCOPE_DEPT_COLUMN, SCOPE_OWNER_COLUMN));
        if (ticket == null) {
            throw new IllegalArgumentException("工单不存在");
        }
        return ticket;
    }

    @Override
    public boolean createTicket(CrmServiceTicket ticket) {
        fillCustomerSnapshot(ticket);
        validate(ticket);
        if (!StringUtils.hasText(ticket.getTicketNo())) {
            ticket.setTicketNo(Localize.nextNo("GD"));
        }
        if (ticket.getOwnerId() == null) {
            ticket.setOwnerId(UserContext.getUserId());
        }
        if (!StringUtils.hasText(ticket.getOwnerName())) {
            ticket.setOwnerName(currentUserName());
        }
        if (ticket.getOpenedTime() == null) {
            ticket.setOpenedTime(now());
        }
        Localize.fillCommonAudit(ticket, currentTenantId(), currentUserName(), now());
        boolean saved = save(ticket);
        if (saved) {
            crmCustomerService.refreshHealth(ticket.getCustomerId());
        }
        return saved;
    }

    @Override
    @Audit(name = "更新服务工单")
    public boolean updateTicket(CrmServiceTicket ticket) {
        if (ticket == null || ticket.getTicketId() == null) {
            throw new IllegalArgumentException("工单ID不能为空");
        }
        fillCustomerSnapshot(ticket);
        validate(ticket);
        CrmServiceTicket persisted = getAccessibleTicket(ticket.getTicketId());
        // M1-4: 所有权校验
        DataScopeUtils.assertOwnership(persisted, CrmServiceTicket::getOwnerId, "服务工单");
        ticket.setTenantId(persisted.getTenantId());
        if (!StringUtils.hasText(ticket.getTicketNo())) {
            ticket.setTicketNo(persisted.getTicketNo());
        }
        if (ticket.getOwnerId() == null) {
            ticket.setOwnerId(persisted.getOwnerId());
        }
        if (!StringUtils.hasText(ticket.getOwnerName())) {
            ticket.setOwnerName(persisted.getOwnerName());
        }
        ticket.setUpdateBy(currentUserName());
        ticket.setUpdateTime(now());
        boolean updated = updateById(ticket);
        if (updated) {
            crmCustomerService.refreshHealth(ticket.getCustomerId());
        }
        return updated;
    }

    @Override
    public boolean resolveTicket(Long ticketId, String solution) {
        CrmServiceTicket ticket = getAccessibleTicket(ticketId);
        ticket.setStatus("RESOLVED");
        ticket.setResolvedTime(now());
        ticket.setSolution(StringUtils.hasText(solution) ? solution : ticket.getSolution());
        ticket.setUpdateBy(currentUserName());
        ticket.setUpdateTime(now());
        boolean updated = updateById(ticket);
        if (updated) {
            crmCustomerService.refreshHealth(ticket.getCustomerId());
        }
        return updated;
    }

    @Override
    public boolean closeTicket(Long ticketId) {
        CrmServiceTicket ticket = getAccessibleTicket(ticketId);
        ticket.setStatus("CLOSED");
        ticket.setResolvedTime(ticket.getResolvedTime() == null ? now() : ticket.getResolvedTime());
        ticket.setUpdateBy(currentUserName());
        ticket.setUpdateTime(now());
        boolean updated = updateById(ticket);
        if (updated) {
            crmCustomerService.refreshHealth(ticket.getCustomerId());
        }
        return updated;
    }

    private void validate(CrmServiceTicket ticket) {
        if (ticket == null) {
            throw new IllegalArgumentException("工单不能为空");
        }
        if (ticket.getCustomerId() == null) {
            throw new IllegalArgumentException("客户ID不能为空");
        }
        if (!StringUtils.hasText(ticket.getTicketTitle())) {
            throw new IllegalArgumentException("工单标题不能为空");
        }
        if (!StringUtils.hasText(ticket.getSeverity())) {
            ticket.setSeverity("LOW");
        }
        if (!StringUtils.hasText(ticket.getIssueType())) {
            ticket.setIssueType("OTHER");
        }
        if (!StringUtils.hasText(ticket.getStatus())) {
            ticket.setStatus("OPEN");
        }
    }

    private void fillCustomerSnapshot(CrmServiceTicket ticket) {
        if (ticket == null || ticket.getCustomerId() == null) {
            return;
        }
        CrmCustomer customer = crmCustomerService.getAccessibleCustomer(ticket.getCustomerId());
        ticket.setCustomerName(customer.getCustomerName());
    }
}
