package com.cloudflow.auth.portal;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.auth.mapper.SysFileMapper;
import com.cloudflow.auth.service.remote.RemotePortalTicketService;
import com.cloudflow.auth.storage.FileStorageRegistry;
import com.cloudflow.common.core.domain.PortalTicketFile;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.security.portal.PortalContext;
import com.cloudflow.common.security.portal.PortalIdentity;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class PortalTicketFileService {
    private final RemotePortalTicketService crm;
    private final SysFileMapper files;
    private final FileStorageRegistry storage;
    private final PortalTicketFileTokens tickets;

    public PortalFileTickets.Access access(String token, String resourceType, Long ticketId, Long fileId) {
        PortalIdentity identity = PortalContext.require();
        authorized(identity, token, resourceType, ticketId, fileId);
        return tickets.issue(identity, token, resourceType, ticketId, fileId);
    }

    public void download(String token, String rawTicket, HttpServletResponse response) {
        PortalIdentity identity = PortalContext.require();
        PortalTicketFileTokens.Ticket ticket = tickets.consume(rawTicket, identity, token);
        SysFile file = authorized(identity, token, ticket.resourceType(), ticket.ticketId(), ticket.fileId());
        try (InputStream stream = storage.getForFile(file).open(file.getFilePath())) {
            response.setContentType("application/octet-stream");
            response.setHeader("Cache-Control", "private, no-store");
            response.setHeader("Pragma", "no-cache");
            response.setHeader("X-Content-Type-Options", "nosniff");
            response.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
            response.setHeader("Referrer-Policy", "no-referrer");
            response.setHeader("Content-Disposition", ContentDisposition.attachment()
                    .filename(file.getFileName(), StandardCharsets.UTF_8).build().toString());
            stream.transferTo(response.getOutputStream());
        } catch (IOException | IllegalStateException failure) { throw new ServiceException("客户工单附件暂不可用", 503); }
    }

    private SysFile authorized(PortalIdentity identity, String token, String resourceType, Long ticketId, Long fileId) {
        PortalTicketFileTokens.validate(resourceType, ticketId, fileId);
        if ("UPLOAD".equals(resourceType)) {
            SysFile file = files.selectOne(new LambdaQueryWrapper<SysFile>().eq(SysFile::getTenantId, identity.tenantId())
                    .eq(SysFile::getPortalOwnerId, identity.portalUserId()).eq(SysFile::getFileId, fileId)
                    .eq(SysFile::getBizType, "PORTAL_TICKET_UPLOAD").eq(SysFile::getAccessType, "PRIVATE").eq(SysFile::getDeleted, 0));
            if (file == null) throw unavailable();
            return file;
        }
        PortalTicketFile allowed = PortalTicketResponses.read(() -> crm.file(token, ticketId, fileId));
        if (!Objects.equals(ticketId, allowed.ticketId()) || allowed.attachment() == null
                || !Objects.equals(fileId, allowed.attachment().getFileId())) throw unavailable();
        SysFile file = files.portalTicketFile(identity.tenantId(), ticketId, fileId);
        if (file == null || !Objects.equals(file.getFileName(), allowed.attachment().getFileName())
                || !Objects.equals(file.getFileSize(), allowed.attachment().getFileSize())
                || !Objects.equals(file.getFileType(), allowed.attachment().getExtension())) throw unavailable();
        return file;
    }

    private static ServiceException unavailable() { return new ServiceException("工单附件不存在或当前账号无权访问", 404); }
}
