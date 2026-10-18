package com.cloudflow.auth.download;

import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.auth.domain.SysFileConfig;
import com.cloudflow.auth.enums.FileStorageType;
import com.cloudflow.auth.preview.FilePreviewResolver;
import com.cloudflow.auth.preview.OaFilePreviewClient;
import com.cloudflow.auth.preview.HrFileDownloadClient;
import com.cloudflow.auth.preview.CrmFileDownloadClient;
import com.cloudflow.auth.storage.FileStorageRegistry;
import com.cloudflow.auth.storage.FileStorageService;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.file.FilePreviewRequest;
import com.cloudflow.common.core.file.HrFileDownloadTypes;
import com.cloudflow.common.security.file.FilePreviewAccess;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.ContentDisposition;
import org.springframework.stereotype.Service;

@Service
public class FileDownloadService {
    private static final Set<String> OA_PRIVATE = Set.of("OA_CONTRACT_EVIDENCE", "OA_CONTRACT_SIGNED", "OA_RFQ_INVITATION", "OA_RFQ_QUOTATION");
    private final Map<String, FileAccessChecker> checkers;
    private final FileStorageRegistry storage;
    private final FileDownloadTickets tickets;
    private final OaFilePreviewClient oa;
    private final HrFileDownloadClient hr;
    private final CrmFileDownloadClient crm;

    public FileDownloadService(List<FileAccessChecker> registrations, FileStorageRegistry storage, FileDownloadTickets tickets, OaFilePreviewClient oa, HrFileDownloadClient hr, CrmFileDownloadClient crm) {
        Map<String, FileAccessChecker> registered = new HashMap<>();
        for (FileAccessChecker checker : registrations) {
            for (String type : checker.businessTypes()) {
                if (registered.putIfAbsent(type, checker) != null) throw new IllegalStateException("重复注册的文件访问业务类型");
            }
        }
        this.checkers = Map.copyOf(registered);
        this.storage = storage;
        this.tickets = tickets;
        this.oa = oa;
        this.hr = hr;
        this.crm = crm;
    }

    public FileDownloadTickets.Access issue(Long fileId, FilePreviewRequest context) {
        FilePreviewAccess.requireSession();
        if (fileId == null || fileId <= 0 || context == null || context.fileId() != null && !fileId.equals(context.fileId())) throw denied();
        FilePreviewRequest request = new FilePreviewRequest(context.bizType() == null ? "PUBLIC" : context.bizType(),
                context.bizId(), fileId, context.reference(), context.slot(), context.childId(), context.versionNo(),
                context.definitionId(), context.instanceId(), context.taskId(), context.fieldPath());
        FilePreviewResolver.Resolved resolved = authorize(request);
        SysFile file = resolved.file();
        if (OA_PRIVATE.contains(request.bizType()) || HrFileDownloadTypes.ALL.contains(request.bizType()) || "CRM_EMAIL_ATTACHMENT".equals(request.bizType())) {
            if (!resolved.stamp().equals(authorize(request).stamp())) throw denied();
            return tickets.issue(request, resolved.stamp(), 300);
        }
        if ("PUBLIC".equals(file.getAccessType()) && publicUrl(file.getUrl())) {
            return new FileDownloadTickets.Access(file.getUrl(), 0);
        }
        FileStorageService backend = storage.getForFile(file);
        SysFileConfig config = backend.getConfiguration();
        int seconds = config == null || config.getSignedUrlExpireSeconds() == null ? 300 : config.getSignedUrlExpireSeconds();
        if (seconds < 1 || seconds > 3600) throw unavailable();
        if (!resolved.stamp().equals(authorize(request).stamp())) throw denied();
        if (backend.getStorageType() == FileStorageType.LOCAL) return tickets.issue(request, resolved.stamp(), seconds);
        long issuedAt = System.currentTimeMillis();
        try {
            String signedUrl = backend.resolveSignedUrl(file.getFilePath(), seconds);
            if (signedUrl == null || signedUrl.isBlank()) throw unavailable();
            return new FileDownloadTickets.Access(signedUrl, issuedAt + seconds * 1000L);
        } catch (RuntimeException failure) { throw unavailable(); }
    }

    public FileDownloadTickets.Access issueByReference(FilePreviewRequest context) {
        FilePreviewAccess.requireSession();
        if (context == null) throw denied();
        context.validated();
        return issue(authorize(context).file().getFileId(), context);
    }

    public void download(String token, HttpServletResponse response) {
        FileDownloadTickets.Ticket ticket = tickets.verify(token);
        FilePreviewResolver.Resolved resolved = authorize(ticket.request());
        if (!ticket.fileStamp().equals(resolved.stamp()) || ticket.expiresAt() <= System.currentTimeMillis()) throw expired();
        headers(response);
        response.setContentType("application/octet-stream");
        if (HrFileDownloadTypes.ALL.contains(ticket.request().bizType()) || "OA_MEETING_ROOM".equals(ticket.request().bizType())) {
            String mediaType = org.springframework.http.MediaTypeFactory.getMediaType(resolved.file().getFileName())
                    .map(org.springframework.http.MediaType::toString).orElse("application/octet-stream");
            if (Set.of("image/jpeg", "image/png", "image/webp", "application/pdf", "application/msword",
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document").contains(mediaType)) response.setContentType(mediaType);
        }
        response.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
        response.setHeader("Content-Disposition", ContentDisposition.attachment()
                .filename(resolved.file().getFileName(), StandardCharsets.UTF_8).build().toString());
        try {
            if (OA_PRIVATE.contains(ticket.request().bizType()) || HrFileDownloadTypes.ALL.contains(ticket.request().bizType())
                    || "CRM_EMAIL_ATTACHMENT".equals(ticket.request().bizType())) {
                try (feign.Response remote = HrFileDownloadTypes.ALL.contains(ticket.request().bizType())
                        ? hr.content(ticket.request()) : "CRM_EMAIL_ATTACHMENT".equals(ticket.request().bizType())
                        ? crm.content(ticket.request()) : oa.downloadContent(ticket.request())) {
                    if (remote == null || remote.status() != 200 || remote.body() == null) throw unavailable();
                    try (InputStream input = remote.body().asInputStream()) { input.transferTo(response.getOutputStream()); }
                }
            } else {
                FileStorageService backend = storage.getForFile(resolved.file());
                if (backend.getStorageType() != FileStorageType.LOCAL) throw expired();
                try (InputStream input = backend.open(resolved.file().getFilePath())) { input.transferTo(response.getOutputStream()); }
            }
        } catch (IOException | RuntimeException failure) { throw unavailable(); }
    }

    private FilePreviewResolver.Resolved authorize(FilePreviewRequest request) {
        FileAccessChecker checker = checkers.get(request.bizType());
        if (checker == null) throw denied();
        request.validated();
        FilePreviewResolver.Resolved resolved = checker.authorize(request);
        if (resolved == null || resolved.file() == null || resolved.stamp() == null
                || request.fileId() != null && !Objects.equals(request.fileId(), resolved.file().getFileId())
                || !Objects.equals(UserContext.getTenantId(), resolved.file().getTenantId())
                || !Integer.valueOf(0).equals(resolved.file().getDeleted())
                || resolved.file().getPortalOwnerId() != null && !CrmFileAccessChecker.portalFile(request, resolved.file())) throw denied();
        return resolved;
    }

    public static void headers(HttpServletResponse response) {
        response.setHeader("Cache-Control", "private, no-store");
        response.setHeader("Pragma", "no-cache");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Referrer-Policy", "no-referrer");
    }

    private static boolean publicUrl(String value) {
        if (value == null || value.isBlank()) return false;
        try {
            URI uri = URI.create(value);
            return Set.of("http", "https").contains(String.valueOf(uri.getScheme())) && uri.getHost() != null
                    && uri.getRawUserInfo() == null && uri.getRawQuery() == null && uri.getRawFragment() == null;
        } catch (IllegalArgumentException failure) { return false; }
    }

    private static ServiceException denied() { return new ServiceException("文件不存在或无权访问，请从对应业务入口申请", 403); }
    private static ServiceException expired() { return new ServiceException("下载凭据已失效，请重新申请", 410); }
    private static ServiceException unavailable() { return new ServiceException("文件下载暂不可用，请稍后重试", 503); }
}
