package com.cloudflow.auth.preview;

import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.file.FilePreviewContent;
import com.cloudflow.common.core.file.FilePreviewRange;
import com.cloudflow.common.core.file.FilePreviewRequest;
import com.cloudflow.common.security.file.FilePreviewAccess;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class FilePreviewService {
    private final FilePreviewResolver resolver;
    private final FilePreviewTickets tickets;
    private final FilePreviewAudit audit;

    public record Preview(boolean supported, String fileName, Long size, String mediaType, String streamUrl,
            Long expiresAt, String message) { }

    public Preview issue(FilePreviewRequest request) {
        FilePreviewAccess.requireContext();
        if (request == null) throw new ServiceException("缺少附件预览上下文", 400);
        request.validated();
        Long fileId = null;
        try {
            FilePreviewResolver.Resolved resolved = resolver.resolve(request);
            fileId = resolved.file().getFileId();
            String mediaType = resolver.mediaType(resolved, request);
            if (mediaType == null) return unsupported(request, resolved,
                    resolved.file().getFileSize() != null && resolved.file().getFileSize() > FilePreviewContent.MAX_BYTES
                            ? "文件超过20 MiB预览上限，请通过原入口下载查看" : "文件格式或元信息不支持预览，请通过原入口下载查看");
            byte[] bytes = resolver.bytes(resolved, request);
            if (!FilePreviewContent.matches(bytes, mediaType)) return unsupported(request, resolved, "附件实际内容与预览格式不一致，请通过原入口下载核对");
            assertUnchanged(resolved, resolver.resolve(request));
            FilePreviewTickets.Access access = tickets.issue(request, resolved, bytes, mediaType);
            audit.record(request, fileId, "ISSUED");
            return new Preview(true, resolved.file().getFileName(), (long) bytes.length, mediaType, access.streamUrl(), access.expiresAt(), "预览凭据60秒内有效");
        } catch (RuntimeException failure) {
            audit.record(request, fileId, "DENIED");
            throw failure;
        }
    }

    public void content(String previewToken, String signature, HttpServletRequest request, HttpServletResponse response) {
        headers(response);
        FilePreviewTickets.Ticket ticket = null;
        try {
            if (request.getParameterValues("previewToken") == null || request.getParameterValues("previewToken").length != 1
                    || request.getParameterValues("signature") == null || request.getParameterValues("signature").length != 1) throw changed();
            ticket = tickets.verify(previewToken, signature);
            FilePreviewResolver.Resolved resolved = resolver.resolve(ticket.request());
            if (!Objects.equals(ticket.fileStamp(), resolved.stamp()) || !Objects.equals(ticket.fileId(), resolved.file().getFileId())
                    || !Objects.equals(ticket.mediaType(), resolver.mediaType(resolved, ticket.request()))) throw changed();
            byte[] bytes = resolver.bytes(resolved, ticket.request());
            if (bytes.length != ticket.size() || !FilePreviewContent.matches(bytes, ticket.mediaType())
                    || !Objects.equals(ticket.contentDigest(), FilePreviewContent.digest(bytes))) throw changed();
            assertUnchanged(resolved, resolver.resolve(ticket.request()));
            tickets.verify(previewToken, signature);
            FilePreviewRange range;
            try {
                if (Collections.list(request.getHeaders("Range")).size() > 1) throw new IllegalArgumentException("附件分段读取范围无效");
                range = FilePreviewRange.parse(request.getHeader("Range"), bytes.length);
            } catch (IllegalArgumentException failure) {
                audit.record(ticket.request(), ticket.fileId(), "RANGE_REJECTED");
                response.setStatus(416);
                response.setHeader("Content-Range", "bytes */" + bytes.length);
                response.setContentLength(0);
                return;
            }
            audit.record(ticket.request(), ticket.fileId(), "READ_AUTHORIZED");
            response.setStatus(range.partial() ? 206 : 200);
            response.setContentType(ticket.mediaType());
            response.setHeader("Content-Disposition", ContentDisposition.inline().filename(ticket.fileName(), StandardCharsets.UTF_8).build().toString());
            response.setContentLength(range.length());
            if (range.partial()) response.setHeader("Content-Range", range.contentRange(bytes.length));
            if (!"HEAD".equals(request.getMethod())) response.getOutputStream().write(bytes, range.start(), range.length());
        } catch (IOException failure) {
            throw new ServiceException("附件预览传输中断，请重新打开", 503);
        } catch (RuntimeException failure) {
            audit.record(ticket == null ? null : ticket.request(), ticket == null ? null : ticket.fileId(), "DENIED");
            throw failure;
        }
    }

    private Preview unsupported(FilePreviewRequest request, FilePreviewResolver.Resolved resolved, String message) {
        audit.record(request, resolved.file().getFileId(), "UNSUPPORTED");
        return new Preview(false, resolved.file().getFileName(), resolved.file().getFileSize(), null, null, null, message);
    }

    private static void assertUnchanged(FilePreviewResolver.Resolved first, FilePreviewResolver.Resolved current) {
        if (!Objects.equals(first.stamp(), current.stamp())) throw changed();
    }

    public static void headers(HttpServletResponse response) {
        response.setHeader("Cache-Control", "private, no-store, max-age=0");
        response.setHeader("Pragma", "no-cache");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Referrer-Policy", "no-referrer");
        response.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
        response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
        response.setHeader("Accept-Ranges", "bytes");
    }

    private static ServiceException changed() { return new ServiceException("附件或授权状态已变化，请重新打开预览", 409); }
}
