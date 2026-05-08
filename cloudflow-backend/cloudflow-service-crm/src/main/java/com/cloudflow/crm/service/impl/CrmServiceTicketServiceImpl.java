package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmServiceTicket;
import com.cloudflow.crm.mapper.CrmServiceTicketMapper;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.cloudflow.crm.service.ICrmServiceTicketService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
public class CrmServiceTicketServiceImpl extends CrmServiceSupport<CrmServiceTicketMapper, CrmServiceTicket>
        implements ICrmServiceTicketService {

    private final ICrmCustomerService customerService;

    @Override
    public PageResult<CrmServiceTicket> queryPage(CrmServiceTicket query, PageQuery pageQuery) {
        LambdaQueryWrapper<CrmServiceTicket> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(CrmServiceTicket::getDelFlag, "0").orderByDesc(CrmServiceTicket::getUpdateTime);
        eqIfPresent(wrapper, CrmServiceTicket::getCustomerId, query.getCustomerId());
        likeIfPresent(wrapper, CrmServiceTicket::getTicketTitle, query.getTicketTitle());
        eqIfPresent(wrapper, CrmServiceTicket::getSeverity, query.getSeverity());
        eqIfPresent(wrapper, CrmServiceTicket::getStatus, query.getStatus());
        return pageResult(pageQuery, wrapper);
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
            customerService.refreshHealth(ticket.getCustomerId());
        }
        return saved;
    }

    @Override
    public boolean updateTicket(CrmServiceTicket ticket) {
        if (ticket == null || ticket.getTicketId() == null) {
            throw new IllegalArgumentException("工单ID不能为空");
        }
        fillCustomerSnapshot(ticket);
        validate(ticket);
        CrmServiceTicket persisted = requireById(ticket.getTicketId(), "工单不存在");
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
            customerService.refreshHealth(ticket.getCustomerId());
        }
        return updated;
    }

    @Override
    public boolean resolveTicket(Long ticketId, String solution) {
        CrmServiceTicket ticket = requireById(ticketId, "工单不存在");
        ticket.setStatus("RESOLVED");
        ticket.setResolvedTime(now());
        ticket.setSolution(StringUtils.hasText(solution) ? solution : ticket.getSolution());
        ticket.setUpdateBy(currentUserName());
        ticket.setUpdateTime(now());
        boolean updated = updateById(ticket);
        if (updated) {
            customerService.refreshHealth(ticket.getCustomerId());
        }
        return updated;
    }

    @Override
    public boolean closeTicket(Long ticketId) {
        CrmServiceTicket ticket = requireById(ticketId, "工单不存在");
        ticket.setStatus("CLOSED");
        ticket.setResolvedTime(ticket.getResolvedTime() == null ? now() : ticket.getResolvedTime());
        ticket.setUpdateBy(currentUserName());
        ticket.setUpdateTime(now());
        boolean updated = updateById(ticket);
        if (updated) {
            customerService.refreshHealth(ticket.getCustomerId());
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
        CrmCustomer customer = customerService.getById(ticket.getCustomerId());
        if (customer != null && "0".equals(customer.getDelFlag())) {
            ticket.setCustomerName(customer.getCustomerName());
        }
    }
}
