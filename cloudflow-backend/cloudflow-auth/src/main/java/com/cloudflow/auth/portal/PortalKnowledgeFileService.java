package com.cloudflow.auth.portal;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.auth.mapper.SysFileMapper;
import com.cloudflow.auth.service.remote.RemotePortalKnowledgeService;
import com.cloudflow.auth.storage.FileStorageRegistry;
import com.cloudflow.common.core.domain.PortalKnowledgeFile;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.security.portal.PortalContext;
import com.cloudflow.common.security.portal.PortalIdentity;
import feign.FeignException;
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
public class PortalKnowledgeFileService {
    private final RemotePortalKnowledgeService knowledge;
    private final SysFileMapper files;
    private final FileStorageRegistry storage;
    private final PortalFileTickets tickets;

    public PortalFileTickets.Access access(String token, Long documentId, Long versionId, Long fileId) {
        PortalIdentity identity = PortalContext.require();
        PortalKnowledgeFile allowed = authorize(token, documentId, versionId, fileId);
        storedFile(identity, allowed);
        return tickets.issue(identity, token, allowed);
    }

    public void download(String token, String rawTicket, HttpServletResponse response) {
        PortalIdentity identity = PortalContext.require();
        PortalFileTickets.Ticket ticket = tickets.consume(rawTicket, identity, token);
        PortalKnowledgeFile allowed = authorize(token, ticket.documentId(), ticket.versionId(), ticket.fileId());
        if (!Objects.equals(ticket.publicationVersion(), allowed.publicationVersion())) throw failed(404);
        SysFile file = storedFile(identity, allowed);
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
        } catch (IOException | IllegalStateException failure) { throw failed(503); }
    }

    private SysFile storedFile(PortalIdentity identity, PortalKnowledgeFile allowed) {
        SysFile file = files.selectOne(new LambdaQueryWrapper<SysFile>().eq(SysFile::getTenantId, identity.tenantId())
                .eq(SysFile::getFileId, allowed.attachment().getFileId()).eq(SysFile::getDeleted, 0));
        if (file == null || !"PRIVATE".equals(file.getAccessType()) || file.getBizType() != null && !file.getBizType().isBlank()
                || file.getFileType() == null || !file.getFileType().matches("[a-z0-9]{1,10}")
                || !Objects.equals(file.getFileName(), allowed.attachment().getFileName())
                || !Objects.equals(file.getFileSize(), allowed.attachment().getFileSize())) throw failed(404);
        return file;
    }

    private PortalKnowledgeFile authorize(String token, Long documentId, Long versionId, Long fileId) {
        R<PortalKnowledgeFile> response;
        try { response = knowledge.file(token, documentId, fileId, versionId); }
        catch (RuntimeException failure) {
            Throwable cause = failure;
            for (int depth = 0; depth < 8 && cause != null; depth++, cause = cause.getCause()) {
                if (cause instanceof FeignException remote) throw failed(remote.status());
            }
            throw failed(503);
        }
        if (response == null) throw failed(503);
        if (!response.isSuccess()) throw failed(response.getCode());
        PortalKnowledgeFile result = response.getData();
        if (result == null || result.attachment() == null || !Objects.equals(documentId, result.documentId())
                || !Objects.equals(versionId, result.versionId()) || !Objects.equals(fileId, result.attachment().getFileId())
                || result.publicationVersion() == null) throw failed(503);
        return result;
    }

    private static ServiceException failed(Integer code) {
        if (Integer.valueOf(401).equals(code)) return new ServiceException("门户登录状态已失效，请重新登录", 401);
        if (Integer.valueOf(404).equals(code)) return new ServiceException("附件不存在或未对外公开，请核对最新状态", 404);
        return new ServiceException("附件暂时无法读取，请稍后重试", 503);
    }
}
