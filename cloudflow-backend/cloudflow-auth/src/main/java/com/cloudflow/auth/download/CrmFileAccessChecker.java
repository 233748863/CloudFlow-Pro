package com.cloudflow.auth.download;

import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.auth.mapper.SysFileMapper;
import com.cloudflow.auth.preview.CrmFileDownloadClient;
import com.cloudflow.auth.preview.FilePreviewResolver;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.file.CrmFileDownloadTypes;
import com.cloudflow.common.core.file.FilePreviewBinding;
import com.cloudflow.common.core.file.FilePreviewContent;
import com.cloudflow.common.core.file.FilePreviewReferences;
import com.cloudflow.common.core.file.FilePreviewRequest;
import com.cloudflow.common.security.file.FilePreviewAccess;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class CrmFileAccessChecker implements FileAccessChecker {
    private final CrmFileDownloadClient crm;
    private final SysFileMapper files;
    private final ObjectMapper json;

    @Override
    public Set<String> businessTypes() { return CrmFileDownloadTypes.ALL; }

    @Override
    public FilePreviewResolver.Resolved authorize(FilePreviewRequest request) {
        FilePreviewAccess.requireSession();
        request.validated();
        if (!businessTypes().contains(request.bizType()) || request.fileId() == null) throw FilePreviewReferences.denied();
        R<FilePreviewBinding> result;
        try { result = crm.authorize(request); }
        catch (feign.FeignException failure) {
            if (Set.of(400, 401, 403, 404, 409).contains(failure.status())) throw FilePreviewReferences.denied();
            throw unavailable();
        } catch (RuntimeException failure) { throw unavailable(); }
        if (result == null) throw unavailable();
        if (!result.isSuccess() || result.getData() == null) {
            if (result.getCode() == 503) throw unavailable();
            throw FilePreviewReferences.denied();
        }
        FilePreviewBinding binding = result.getData();
        if (!Objects.equals(request.fileId(), FilePreviewReferences.fileId(binding.reference()))) throw FilePreviewReferences.denied();
        boolean portal = "CRM_PORTAL_TICKET".equals(request.bizType());
        SysFile file = portal ? files.portalTicketFile(UserContext.getTenantId(), request.businessId(), request.fileId())
                : files.selectById(request.fileId());
        if (file == null || !Objects.equals(UserContext.getTenantId(), file.getTenantId())
                || !Integer.valueOf(0).equals(file.getDeleted()) || !request.bizType().equals(file.getBizType())
                || !"PRIVATE".equals(file.getAccessType())
                || file.getUrl() != null && !file.getUrl().isBlank()) throw FilePreviewReferences.denied();
        if (portal) {
            if (!portalFile(request, file) || file.getFileType() == null
                    || !file.getFileType().matches("[a-z0-9]{1,10}")) throw FilePreviewReferences.denied();
        } else if (file.getPortalOwnerId() != null || !request.bizType().equals(file.getFileType())
                || !"LOCAL".equals(file.getStorageType())) throw FilePreviewReferences.denied();
        try {
            return new FilePreviewResolver.Resolved(file, binding, FilePreviewContent.digest(
                    json.writeValueAsString(file) + "\n" + json.writeValueAsString(binding)));
        } catch (JsonProcessingException failure) { throw unavailable(); }
    }

    static boolean portalFile(FilePreviewRequest request, SysFile file) {
        return "CRM_PORTAL_TICKET".equals(request.bizType()) && "CRM_PORTAL_TICKET".equals(file.getBizType())
                && request.bizId().equals(file.getBizId()) && file.getPortalOwnerId() != null
                && "PRIVATE".equals(file.getAccessType());
    }

    private static ServiceException unavailable() { return new ServiceException("客户附件授权暂不可用，请稍后重试", 503); }
}
