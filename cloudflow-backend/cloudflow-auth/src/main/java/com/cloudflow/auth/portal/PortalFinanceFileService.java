package com.cloudflow.auth.portal;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.auth.mapper.SysFileMapper;
import com.cloudflow.auth.storage.FileStorageRegistry;
import com.cloudflow.common.core.domain.PortalFinanceFile;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.security.portal.PortalContext;
import com.cloudflow.common.security.portal.PortalIdentity;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class PortalFinanceFileService {
    private static final Map<String, String> PREVIEW_TYPES = Map.of("png", "image/png", "jpg", "image/jpeg",
            "jpeg", "image/jpeg", "pdf", "application/pdf");
    private final PortalFinanceReader finance;
    private final SysFileMapper files;
    private final FileStorageRegistry storage;
    private final PortalFinanceFileTokens tickets;

    public PortalFileTickets.Access access(String token, String kind, Long id, Long fileId) {
        PortalIdentity identity = PortalContext.require();
        PortalFinanceFile allowed = finance.file(kind, token, id, fileId);
        local(identity, allowed, kind, id, fileId);
        return tickets.issue(identity, token, allowed);
    }

    public void content(String token, String raw, boolean preview, HttpServletResponse response) {
        PortalIdentity identity = PortalContext.require();
        PortalFinanceFileTokens.Ticket ticket = tickets.consume(raw, identity, token);
        PortalFinanceFile allowed = finance.file(ticket.kind(), token, ticket.recordId(), ticket.fileId());
        if (!Objects.equals(ticket.publicationVersion(), allowed.publicationVersion())) throw unavailable();
        SysFile file = local(identity, allowed, ticket.kind(), ticket.recordId(), ticket.fileId());
        String type = file.getFileType() == null ? null : PREVIEW_TYPES.get(file.getFileType());
        if (preview && type == null) throw new ServiceException("此票据格式请下载后查看", 400);
        try (InputStream stream = storage.getForFile(file).open(file.getFilePath())) {
            response.setContentType(preview ? type : "application/octet-stream");
            response.setHeader("Cache-Control", "private, no-store");
            response.setHeader("Pragma", "no-cache");
            response.setHeader("X-Content-Type-Options", "nosniff");
            response.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
            response.setHeader("Referrer-Policy", "no-referrer");
            response.setHeader("Content-Disposition", (preview ? ContentDisposition.inline() : ContentDisposition.attachment())
                    .filename(file.getFileName(), StandardCharsets.UTF_8).build().toString());
            stream.transferTo(response.getOutputStream());
        } catch (IOException | IllegalStateException failure) { throw new ServiceException("客户财务票据暂不可用", 503); }
    }

    private SysFile local(PortalIdentity identity, PortalFinanceFile allowed, String kind, Long id, Long fileId) {
        if (allowed == null || !Objects.equals(kind, allowed.kind()) || !Objects.equals(id, allowed.recordId())
                || allowed.attachment() == null || !Objects.equals(fileId, allowed.attachment().getFileId())) throw unavailable();
        SysFile file = files.selectOne(new LambdaQueryWrapper<SysFile>().eq(SysFile::getTenantId, identity.tenantId())
                .eq(SysFile::getFileId, fileId).eq(SysFile::getBizType, "PORTAL_FINANCE_" + kind)
                .eq(SysFile::getBizId, id.toString()).eq(SysFile::getAccessType, "PRIVATE")
                .isNull(SysFile::getPortalOwnerId).eq(SysFile::getDeleted, 0));
        if (file == null || !Objects.equals(file.getFileName(), allowed.attachment().getFileName())
                || !Objects.equals(file.getFileSize(), allowed.attachment().getFileSize())
                || !Objects.equals(file.getFileType(), allowed.attachment().getExtension())) throw unavailable();
        return file;
    }
    private static ServiceException unavailable() { return new ServiceException("财务票据不存在或尚未向客户公开", 404); }
}
