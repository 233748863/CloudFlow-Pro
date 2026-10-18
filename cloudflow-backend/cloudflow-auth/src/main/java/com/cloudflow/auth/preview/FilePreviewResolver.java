package com.cloudflow.auth.preview;

import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.auth.mapper.SysFileMapper;
import com.cloudflow.auth.service.ISysFileService;
import com.cloudflow.auth.storage.FileStorageRegistry;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.file.FilePreviewBinding;
import com.cloudflow.common.core.file.FilePreviewContent;
import com.cloudflow.common.core.file.FilePreviewReferences;
import com.cloudflow.common.core.file.FilePreviewRequest;
import com.cloudflow.common.core.file.HrFileDownloadTypes;
import com.cloudflow.common.core.file.CrmFileDownloadTypes;
import com.cloudflow.common.core.file.OaFileDownloadTypes;
import com.cloudflow.common.core.file.HrBusinessFileDownloadTypes;
import com.cloudflow.common.security.file.FilePreviewAccess;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class FilePreviewResolver {
    private static final Set<String> PRIVATE = Set.of("OA_CONTRACT_EVIDENCE", "OA_CONTRACT_SIGNED", "OA_RFQ_INVITATION", "OA_RFQ_QUOTATION");
    private final ISysFileService publicFiles;
    private final SysFileMapper files;
    private final FileStorageRegistry storage;
    private final OaFilePreviewClient oa;
    private final HrFilePreviewClient hr;
    private final WorkflowFilePreviewClient workflow;
    private final ObjectMapper json;

    public record Resolved(SysFile file, FilePreviewBinding binding, String stamp) { }

    public Resolved resolve(FilePreviewRequest request) {
        FilePreviewAccess.requireContext();
        return resolveBinding(request, false);
    }

    public Resolved resolveDownload(FilePreviewRequest request) {
        FilePreviewAccess.requireSession();
        return resolveBinding(request, true);
    }

    private Resolved resolveBinding(FilePreviewRequest request, boolean download) {
        request.validated();
        if (!download && (OaFileDownloadTypes.ALL.contains(request.bizType())
                || HrBusinessFileDownloadTypes.ALL.contains(request.bizType()))) throw FilePreviewReferences.denied();
        if (HrFileDownloadTypes.ALL.contains(request.bizType()) || CrmFileDownloadTypes.ALL.contains(request.bizType())) throw FilePreviewReferences.denied();
        SysFile file;
        FilePreviewBinding binding;
        if ("PUBLIC".equals(request.bizType())) {
            StpUtil.checkPermission("system:file:list");
            Long fileId = request.fileId() == null && request.reference() != null ? FilePreviewReferences.fileId(request.reference()) : request.fileId();
            file = publicFiles.getPublicPreviewFile(fileId, request.reference());
            if (request.reference() != null) {
                FilePreviewReferences.choose(request, List.of("/api/auth/system/file/" + file.getFileId() + "/content",
                        file.getFilePath() == null ? "" : file.getFilePath(), file.getUrl() == null ? "" : file.getUrl()));
            }
            binding = new FilePreviewBinding("/api/auth/system/file/" + file.getFileId() + "/content", "PUBLIC");
        } else {
            FilePreviewRemoteApi adapter = request.bizType().startsWith("OA_") ? oa
                    : "HR_RESUME".equals(request.bizType()) || HrBusinessFileDownloadTypes.ALL.contains(request.bizType()) ? hr : workflow;
            R<FilePreviewBinding> result;
            try { result = download ? adapter.authorizeDownload(request) : adapter.authorize(request); }
            catch (feign.FeignException failure) {
                if (Set.of(400, 401, 403, 404, 409).contains(failure.status())) throw FilePreviewReferences.denied();
                throw unavailable();
            }
            catch (RuntimeException failure) { throw unavailable(); }
            if (result == null) throw unavailable();
            if (!result.isSuccess() || result.getData() == null) {
                if (result.getCode() == 503) throw unavailable();
                throw FilePreviewReferences.denied();
            }
            binding = result.getData();
            Long fileId = FilePreviewReferences.fileId(binding.reference());
            file = fileId == null ? files.selectPreviewReference(UserContext.getTenantId(), binding.reference(), request.fileId()) : files.selectById(fileId);
        }
        if (file == null || !Objects.equals(UserContext.getTenantId(), file.getTenantId())
                || !Integer.valueOf(0).equals(file.getDeleted()) || file.getPortalOwnerId() != null
                || request.fileId() != null && !Objects.equals(request.fileId(), file.getFileId())) throw FilePreviewReferences.denied();
        if (PRIVATE.contains(request.bizType())) {
            if (!request.bizType().equals(file.getFileType()) || !"LOCAL".equals(file.getStorageType())
                    || !binding.reference().startsWith("oa-file:" + request.bizType().substring(3) + ":")) throw FilePreviewReferences.denied();
        } else if ("OA_MEETING_ROOM".equals(request.bizType())) {
            if (!"OA_MEETING_ROOM".equals(file.getBizType()) || !request.bizId().equals(file.getBizId())
                    || !"PRIVATE".equals(file.getAccessType()) || file.getFileType() == null
                    || !Set.of("png", "jpg", "jpeg").contains(file.getFileType().toLowerCase(Locale.ROOT))) throw FilePreviewReferences.denied();
        } else if ("WORKFLOW_FORM".equals(request.bizType())) {
            if (!"WORKFLOW_FORM".equals(file.getBizType()) || !request.bizId().equals(file.getBizId())
                    || !"PRIVATE".equals(file.getAccessType())) throw FilePreviewReferences.denied();
        } else if (file.getBizType() != null && !file.getBizType().isBlank()
                || file.getFileType() != null && !file.getFileType().matches("[A-Za-z0-9]{1,16}")) {
            throw FilePreviewReferences.denied();
        }
        try {
            return new Resolved(file, binding, FilePreviewContent.digest(json.writeValueAsString(file) + "\n" + json.writeValueAsString(binding)));
        } catch (JsonProcessingException failure) { throw unavailable(); }
    }

    public String mediaType(Resolved resolved, FilePreviewRequest request) {
        SysFile file = resolved.file();
        String mediaType = FilePreviewContent.mediaType(file.getFileName());
        if (mediaType == null || file.getFileSize() == null || file.getFileSize() <= 0 || file.getFileSize() > FilePreviewContent.MAX_BYTES) return null;
        if (!PRIVATE.contains(request.bizType())) {
            String extension = file.getFileName().substring(file.getFileName().lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
            if (!Objects.equals(extension, file.getFileType() == null ? null : file.getFileType().toLowerCase(Locale.ROOT))) return null;
        }
        return mediaType;
    }

    public byte[] bytes(Resolved resolved, FilePreviewRequest request) {
        if (resolved.file().getFileSize() == null || resolved.file().getFileSize() <= 0 || resolved.file().getFileSize() > FilePreviewContent.MAX_BYTES) throw unavailable();
        byte[] bytes;
        try {
            if (PRIVATE.contains(request.bizType())) {
                try (feign.Response response = oa.content(request)) {
                    if (response == null || response.status() != 200 || response.body() == null) throw unavailable();
                    try (InputStream input = response.body().asInputStream()) { bytes = input.readNBytes(FilePreviewContent.MAX_BYTES + 1); }
                }
            } else {
                try (InputStream input = storage.getForFile(resolved.file()).open(resolved.file().getFilePath())) {
                    bytes = input.readNBytes(FilePreviewContent.MAX_BYTES + 1);
                }
            }
        } catch (IOException | RuntimeException failure) { throw unavailable(); }
        if (bytes.length != resolved.file().getFileSize() || bytes.length > FilePreviewContent.MAX_BYTES) throw unavailable();
        if (resolved.file().getFileHash() != null && !resolved.file().getFileHash().isBlank()
                && !resolved.file().getFileHash().equals(FilePreviewContent.digest(bytes))) throw unavailable();
        return bytes;
    }

    private static ServiceException unavailable() { return new ServiceException("附件预览验证或存储暂不可用，请从原业务入口重试", 503); }
}
