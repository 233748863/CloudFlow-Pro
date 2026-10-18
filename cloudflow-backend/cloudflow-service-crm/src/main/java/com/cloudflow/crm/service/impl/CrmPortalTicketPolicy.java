package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.domain.PortalTicketRequest;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.security.portal.PortalIdentity;
import com.cloudflow.crm.domain.CrmServiceTicket;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

public final class CrmPortalTicketPolicy {
    public static final String TEMPORARY_FILES = "PORTAL_TICKET_UPLOAD";
    public static final String TICKET_FILES = "CRM_PORTAL_TICKET";
    public static final Set<String> PUBLIC_STATUSES = Set.of("PENDING_ASSIGNMENT", "OPEN", "IN_PROGRESS",
            "WAITING_CUSTOMER", "RESOLVED", "CLOSED");

    private CrmPortalTicketPolicy() { }

    public static void validate(PortalTicketRequest request) {
        if (request == null) throw new ServiceException("工单内容不能为空", 400);
        requestKey(request.getRequestKey());
        request.setTitle(text(request.getTitle(), 120, "工单标题"));
        request.setDescription(text(request.getDescription(), 1000, "问题描述"));
        List<Long> files = request.getFileIds();
        if (files == null || files.size() > 10 || files.stream().anyMatch(fileId -> fileId == null || fileId <= 0)
                || new HashSet<>(files).size() != files.size()) {
            throw new ServiceException("附件须为最多10个不重复的有效文件", 400);
        }
        request.setFileIds(files.stream().sorted().toList());
    }

    public static String number(PortalIdentity identity, String requestKey) {
        requestKey(requestKey);
        String source = identity.tenantId() + ":" + identity.portalUserId() + ":" + identity.contactId() + ":" + requestKey;
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(source.getBytes(StandardCharsets.UTF_8));
            return "GD_P" + Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }

    public static void requestKey(String value) {
        if (value == null || !value.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")) {
            throw new ServiceException("请求标识无效，请重新打开提交页面", 400);
        }
    }

    public static String text(String value, int maximum, String label) {
        if (value == null || value.isBlank() || value.length() > maximum
                || value.codePoints().anyMatch(character -> Character.isISOControl(character)
                    && character != '\n' && character != '\r' && character != '\t')) {
            throw new ServiceException(label + "不能为空、超过" + maximum + "字符或包含控制字符", 400);
        }
        return value.trim();
    }

    public static boolean pending(CrmServiceTicket ticket) {
        return ticket.getPortalContactId() != null && ticket.getOwnerId() == null;
    }

    public static void requireAssigned(CrmServiceTicket ticket) {
        if (pending(ticket)) throw new ServiceException("请先由管理员或客服分派工单", 409);
    }

    public static void protectCreate(CrmServiceTicket ticket) {
        if (ticket.getPortalContactId() != null || ticket.getPortalSolution() != null || ticket.getPortalSolutionTime() != null) {
            throw new ServiceException("门户来源及对外方案不能通过内部创建入口指定", 400);
        }
    }

    public static void protectUpdate(CrmServiceTicket request, CrmServiceTicket current) {
        if (request.getPortalContactId() != null && !Objects.equals(request.getPortalContactId(), current.getPortalContactId())
                || request.getPortalSolution() != null && !Objects.equals(request.getPortalSolution(), current.getPortalSolution())
                || request.getPortalSolutionTime() != null && !Objects.equals(request.getPortalSolutionTime(), current.getPortalSolutionTime())) {
            throw new ServiceException("门户来源及对外方案须通过专用入口操作", 400);
        }
        if (current.getPortalContactId() == null) return;
        if (request.getOwnerId() != null && !Objects.equals(request.getOwnerId(), current.getOwnerId())) {
            throw new ServiceException("客户工单负责人须由管理员或客服通过分派入口修改", 403);
        }
        if (request.getTicketTitle() != null && !Objects.equals(request.getTicketTitle(), current.getTicketTitle())
                || request.getDescription() != null && !Objects.equals(request.getDescription(), current.getDescription())) {
            throw new ServiceException("客户原始标题与描述不能修改，请在内部处理意见中补充", 400);
        }
    }
}
