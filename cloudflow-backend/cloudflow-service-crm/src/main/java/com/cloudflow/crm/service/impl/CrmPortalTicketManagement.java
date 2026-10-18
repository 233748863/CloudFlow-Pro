package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.PortalFileVO;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.crm.domain.CrmServiceTicket;
import com.cloudflow.crm.domain.dto.CrmPortalTicketCommands;
import com.cloudflow.crm.mapper.CrmPortalTicketMapper;
import com.cloudflow.crm.mapper.CrmServiceTicketMapper;
import com.cloudflow.crm.service.ICrmServiceTicketService;
import com.cloudflow.crm.service.remote.RemotePortalTicketFiles;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.cloud.client.circuitbreaker.NoFallbackAvailableException;
import org.springframework.http.ContentDisposition;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CrmPortalTicketManagement {
    private final CrmPortalTicketMapper portal;
    private final CrmServiceTicketMapper tickets;
    private final ICrmServiceTicketService ticketService;
    private final CrmSlaService sla;
    private final CrmAuditTrail audit;
    private final RemotePortalTicketFiles storage;

    public record View(CrmServiceTicket ticket, List<PortalFileVO> attachments, boolean canAssign, boolean canPublish) { }

    public View view(Long ticketId) {
        return view(ticketService.getAccessibleTicket(ticketId));
    }

    public PageResult<CrmPortalTicketMapper.Handler> handlers(Long ticketId, String keyword, int pageNum, int pageSize) {
        requireDispatcher();
        CrmServiceTicket ticket = ticketService.getAccessibleTicket(ticketId);
        requirePortal(ticket);
        if (pageNum < 1 || pageNum > 1_000_000 || pageSize < 1 || pageSize > 100 || keyword != null && keyword.length() > 100) {
            throw new ServiceException("处理人查询条件无效", 400);
        }
        return PageResult.build(portal.handlers(new Page<>(pageNum, pageSize), CrmRecordSupport.tenantId(),
                keyword == null ? null : keyword.trim()));
    }

    @Audit(name = "分派客户门户工单")
    @Transactional(rollbackFor = Exception.class)
    public View assign(Long ticketId, CrmPortalTicketCommands.Assignment request) {
        requireDispatcher();
        CrmServiceTicket ticket = locked(ticketId);
        requirePortal(ticket);
        version(ticket, request);
        if (Set.of("RESOLVED", "CLOSED").contains(ticket.getStatus())) throw new ServiceException("已解决或关闭的工单不能重新分派", 409);
        CrmPortalTicketMapper.Handler handler = request.getOwnerId() == null ? null
                : portal.handler(CrmRecordSupport.tenantId(), request.getOwnerId());
        if (handler == null) throw new ServiceException("接手人须为同租户有效且具有工单处理权限的CRM人员", 400);
        if (Objects.equals(ticket.getOwnerId(), handler.getUserId())) return view(ticket);
        Long previousOwner = ticket.getOwnerId();
        ticket.setOwnerId(handler.getUserId());
        ticket.setOwnerName(handler.getName());
        CrmRecordSupport.touch(ticket);
        CrmRecordSupport.saved(tickets.updateById(ticket));
        audit.record("PORTAL_TICKET_ASSIGNED", ticketId.toString(),
                "原负责人=" + previousOwner + ";接手人=" + handler.getUserId(), false);
        return view(ticket);
    }

    @Audit(name = "发布或撤回客户工单方案")
    @Transactional(rollbackFor = Exception.class)
    public View publish(Long ticketId, CrmPortalTicketCommands.Publication request) {
        if (!portal.publisher(CrmRecordSupport.tenantId(), UserContext.getUserId())) throw new ServiceException("无权发布客户工单方案", 403);
        CrmServiceTicket ticket = locked(ticketId);
        CrmPortalTicketPolicy.requireAssigned(ticket);
        DataScopeUtils.assertOwnership(ticket, CrmServiceTicket::getOwnerId, "服务工单");
        version(ticket, request);
        if (request.getPublish() == null) throw new ServiceException("必须明确发布或撤回", 400);
        String content = Boolean.TRUE.equals(request.getPublish())
                ? CrmPortalTicketPolicy.text(request.getSolution(), 10000, "对外解决方案") : null;
        if (!request.getPublish() && request.getSolution() != null && !request.getSolution().isBlank()) {
            throw new ServiceException("撤回时不能同时提交新方案", 400);
        }
        if (Objects.equals(content, ticket.getPortalSolution())
                && (content == null) == (ticket.getPortalSolutionTime() == null)) return view(ticket);
        String previous = ticket.getPortalSolution();
        ticket.setPortalSolution(content);
        ticket.setPortalSolutionTime(content == null ? null : LocalDateTime.now().truncatedTo(ChronoUnit.SECONDS));
        if (content != null) sla.change(ticket, ticket.getStatus(), ticket.getSeverity(), true);
        CrmRecordSupport.touch(ticket);
        CrmRecordSupport.saved(tickets.updateById(ticket));
        audit.record(content == null ? "PORTAL_TICKET_SOLUTION_WITHDRAWN" : "PORTAL_TICKET_SOLUTION_PUBLISHED",
                ticketId.toString(), "原对外方案=" + Objects.toString(previous, "") + ";当前对外方案=" + Objects.toString(content, ""), false);
        return view(ticket);
    }

    public PortalFileVO authorizeDownload(Long ticketId, Long fileId) {
        CrmServiceTicket ticket = ticketService.getAccessibleTicket(ticketId);
        return portal.files(ticket.getTenantId(), ticketId).stream()
                .filter(candidate -> Objects.equals(fileId, candidate.getFileId())).findFirst()
                .orElseThrow(() -> new ServiceException("客户工单附件不存在或无权访问", 404));
    }

    public void content(Long ticketId, Long fileId, HttpServletResponse response) {
        PortalFileVO file = authorizeDownload(ticketId, fileId);
        try (feign.Response upstream = storage.content(ticketId, fileId)) {
            if (upstream == null || upstream.status() != 200 || upstream.body() == null) throw unavailable();
            String type = upstream.headers().entrySet().stream().filter(header -> "Content-Type".equalsIgnoreCase(header.getKey()))
                    .flatMap(header -> header.getValue().stream()).findFirst().orElse("");
            if (!"application/octet-stream".equals(type)) throw unavailable();
            response.setContentType(type);
            response.setHeader("Cache-Control", "private, no-store");
            response.setHeader("X-Content-Type-Options", "nosniff");
            response.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
            response.setHeader("Referrer-Policy", "no-referrer");
            response.setHeader("Content-Disposition", ContentDisposition.attachment().filename(file.getFileName(), StandardCharsets.UTF_8).build().toString());
            try (InputStream content = upstream.body().asInputStream()) { content.transferTo(response.getOutputStream()); }
        } catch (IOException | feign.FeignException | NoFallbackAvailableException failure) { throw unavailable(); }
    }

    private View view(CrmServiceTicket ticket) {
        boolean canAssign = ticket.getPortalContactId() != null && !Set.of("RESOLVED", "CLOSED").contains(ticket.getStatus())
                && portal.dispatcher(CrmRecordSupport.tenantId(), UserContext.getUserId());
        boolean canPublish = Objects.equals(ticket.getOwnerId(), UserContext.getUserId()) && UserContext.getUserId() != null
                && portal.publisher(CrmRecordSupport.tenantId(), UserContext.getUserId());
        return new View(ticket, portal.files(ticket.getTenantId(), ticket.getTicketId()), canAssign, canPublish);
    }

    private CrmServiceTicket locked(Long ticketId) {
        CrmServiceTicket ticket = ticketId == null ? null : tickets.lockById(ticketId);
        if (ticket == null || !Objects.equals(ticket.getTenantId(), CrmRecordSupport.tenantId())) {
            throw new ServiceException("工单不存在或无权访问", 404);
        }
        ticketService.getAccessibleTicket(ticketId);
        return ticket;
    }

    private void requireDispatcher() {
        if (UserContext.getUserId() == null || !portal.dispatcher(CrmRecordSupport.tenantId(), UserContext.getUserId())) {
            throw new ServiceException("客户工单须由管理员或客服分派", 403);
        }
    }

    private static void requirePortal(CrmServiceTicket ticket) {
        if (ticket.getPortalContactId() == null) throw new ServiceException("此入口仅用于客户门户提交的工单", 400);
    }

    private static void version(CrmServiceTicket ticket, CrmPortalTicketCommands.Versioned request) {
        if (request == null || request.getVersion() == null || request.getVersion() < 0 || !Objects.equals(ticket.getVersion(), request.getVersion())) {
            throw new ServiceException("工单已变化，请读取当前版本后再操作", 409);
        }
    }

    private static ServiceException unavailable() { return new ServiceException("客户工单附件暂不可用，请稍后重试", 503); }
}
