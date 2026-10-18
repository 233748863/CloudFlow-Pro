package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.PortalFileVO;
import com.cloudflow.common.core.domain.PortalTicketFile;
import com.cloudflow.common.core.domain.PortalTicketRequest;
import com.cloudflow.common.core.domain.PortalTicketVO;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.security.portal.PortalIdentity;
import com.cloudflow.common.security.portal.PortalTokens;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmServiceTicket;
import com.cloudflow.crm.mapper.CrmPortalTicketMapper;
import com.cloudflow.crm.mapper.CrmServiceTicketMapper;
import com.cloudflow.crm.service.ICrmCustomerService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CrmPortalTicketService {
    private final PortalTokens tokens;
    private final CrmPortalTicketMapper portal;
    private final CrmServiceTicketMapper tickets;
    private final CrmSlaService sla;
    private final ICrmCustomerService customers;
    private final CrmAuditTrail audit;

    public PageResult<PortalTicketVO> list(String token, String keyword, String status, int pageNum, int pageSize) {
        PortalIdentity identity = identity(token, false);
        if (pageNum < 1 || pageNum > 1_000_000 || pageSize < 1 || pageSize > 100
                || keyword != null && keyword.length() > 100
                || status != null && !status.isBlank() && !CrmPortalTicketPolicy.PUBLIC_STATUSES.contains(status)) {
            throw new ServiceException("工单查询条件无效", 400);
        }
        return PageResult.build(portal.page(new Page<>(pageNum, pageSize), identity,
                keyword == null ? null : keyword.trim(), status));
    }

    public PortalTicketVO detail(String token, Long ticketId) {
        return detail(identity(token, false), ticketId);
    }

    public PortalTicketVO submission(String token, String requestKey) {
        PortalIdentity identity = identity(token, false);
        CrmServiceTicket existing = portal.byNumber(identity.tenantId(), CrmPortalTicketPolicy.number(identity, requestKey));
        if (existing == null || !Integer.valueOf(0).equals(existing.getDeleted())
                || !Objects.equals(existing.getPortalContactId(), identity.contactId())
                || !Objects.equals(existing.getCustomerId(), identity.customerId())) throw unavailable();
        return detail(identity, existing.getTicketId());
    }

    @Audit(name = "客户门户提交工单")
    @Transactional(rollbackFor = Exception.class)
    public PortalTicketVO create(String token, PortalTicketRequest request) {
        CrmPortalTicketPolicy.validate(request);
        PortalIdentity identity = identity(token, true);
        String number = CrmPortalTicketPolicy.number(identity, request.getRequestKey());
        CrmServiceTicket existing = portal.byNumber(identity.tenantId(), number);
        if (existing != null) {
            if (!Integer.valueOf(0).equals(existing.getDeleted()) || !Objects.equals(existing.getCustomerId(), identity.customerId())
                    || !Objects.equals(existing.getPortalContactId(), identity.contactId())
                    || !Objects.equals(existing.getTicketTitle(), request.getTitle())
                    || !Objects.equals(existing.getDescription(), request.getDescription())
                    || !portal.files(identity.tenantId(), existing.getTicketId()).stream().map(PortalFileVO::getFileId).sorted().toList()
                        .equals(request.getFileIds())) {
                throw new ServiceException("该请求已使用且内容不同或工单已撤除，请核对原提交结果", 409);
            }
            return detail(identity, existing.getTicketId());
        }
        CrmCustomer customer = portal.customer(identity);
        if (customer == null) throw unauthenticated();
        CrmServiceTicket ticket = new CrmServiceTicket();
        CrmRecordSupport.create(ticket, "ticketId");
        ticket.setCreateBy("portal:" + identity.portalUserId());
        ticket.setUpdateBy(ticket.getCreateBy());
        ticket.setCustomerId(identity.customerId());
        ticket.setCustomerName(customer.getCustomerName());
        ticket.setPortalContactId(identity.contactId());
        ticket.setTicketNo(number);
        ticket.setTicketTitle(request.getTitle());
        ticket.setDescription(request.getDescription());
        ticket.setSeverity("P4");
        ticket.setIssueType("OTHER");
        ticket.setStatus("OPEN");
        ticket.setOpenedTime(LocalDateTime.now());
        sla.initialize(ticket);
        CrmRecordSupport.saved(tickets.insert(ticket));
        bind(identity, ticket.getTicketId(), request.getFileIds());
        customers.refreshHealth(identity.customerId());
        audit.record("PORTAL_TICKET_CREATED", ticket.getTicketId().toString(), "客户提交工单，等待管理员或客服分派", false);
        return detail(identity, ticket.getTicketId());
    }

    public PortalTicketFile file(String token, Long ticketId, Long fileId) {
        PortalIdentity identity = identity(token, false);
        PortalTicketVO ticket = detail(identity, ticketId);
        PortalFileVO attachment = ticket.getAttachments().stream().filter(file -> Objects.equals(fileId, file.getFileId()))
                .findFirst().orElseThrow(CrmPortalTicketService::unavailable);
        return new PortalTicketFile(ticketId, attachment);
    }

    private PortalTicketVO detail(PortalIdentity identity, Long ticketId) {
        if (ticketId == null || ticketId <= 0) throw unavailable();
        PortalTicketVO ticket = portal.detail(identity, ticketId);
        if (ticket == null) throw unavailable();
        ticket.setAttachments(portal.files(identity.tenantId(), ticketId));
        return ticket;
    }

    private void bind(PortalIdentity identity, Long ticketId, List<Long> fileIds) {
        if (fileIds.isEmpty()) return;
        List<CrmPortalTicketMapper.Upload> uploads = fileIds.stream()
                .map(fileId -> portal.lockUpload(identity.tenantId(), fileId)).toList();
        if (uploads.stream().anyMatch(file -> file == null
                || !Objects.equals(identity.portalUserId(), file.getPortalOwnerId())
                || !CrmPortalTicketPolicy.TEMPORARY_FILES.equals(file.getBizType())
                || !"PRIVATE".equals(file.getAccessType()) || !Integer.valueOf(0).equals(file.getDeleted()))) {
            throw new ServiceException("附件不存在、已关联工单或不属于当前上传者，请重新核对", 409);
        }
        for (Long fileId : fileIds) {
            if (portal.bindFile(identity, ticketId, fileId) != 1) throw new ServiceException("附件状态已变化，请重新核对", 409);
        }
    }

    private PortalIdentity identity(String token, boolean lock) {
        PortalIdentity identity = tokens.verify(token);
        if (identity == null || !Objects.equals(identity.tenantId(), UserContext.getTenantId())
                || (lock ? portal.lockActiveIdentity(identity) == null : !portal.activeIdentity(identity))) throw unauthenticated();
        return identity;
    }

    private static ServiceException unavailable() { return new ServiceException("工单或附件不存在或无权访问", 404); }
    private static ServiceException unauthenticated() { return new ServiceException("门户登录状态已失效，请重新登录", 401); }
}
