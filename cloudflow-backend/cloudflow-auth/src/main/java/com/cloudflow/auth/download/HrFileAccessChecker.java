package com.cloudflow.auth.download;

import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.auth.mapper.SysFileMapper;
import com.cloudflow.auth.preview.FilePreviewResolver;
import com.cloudflow.auth.preview.HrFileDownloadClient;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.file.FilePreviewBinding;
import com.cloudflow.common.core.file.FilePreviewContent;
import com.cloudflow.common.core.file.FilePreviewReferences;
import com.cloudflow.common.core.file.FilePreviewRequest;
import com.cloudflow.common.core.file.HrFileDownloadTypes;
import com.cloudflow.common.security.file.FilePreviewAccess;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class HrFileAccessChecker implements FileAccessChecker {
    private final HrFileDownloadClient hr;
    private final SysFileMapper files;
    private final ObjectMapper json;

    @Override
    public Set<String> businessTypes() { return HrFileDownloadTypes.ALL; }

    @Override
    public FilePreviewResolver.Resolved authorize(FilePreviewRequest request) {
        FilePreviewAccess.requireSession();
        request.validated();
        if (!businessTypes().contains(request.bizType()) || request.fileId() == null) throw FilePreviewReferences.denied();
        R<FilePreviewBinding> result;
        try { result = hr.authorize(request); }
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
        SysFile file = files.selectById(request.fileId());
        if (file == null || !Objects.equals(UserContext.getTenantId(), file.getTenantId())
                || !Integer.valueOf(0).equals(file.getDeleted()) || file.getPortalOwnerId() != null
                || !"LOCAL".equals(file.getStorageType()) || !purpose(request.bizType()).contains(file.getFileType())
                || !privateOrLegacyCertificate(request.bizType(), file)) throw FilePreviewReferences.denied();
        try {
            return new FilePreviewResolver.Resolved(file, binding, FilePreviewContent.digest(
                    json.writeValueAsString(file) + "\n" + json.writeValueAsString(binding)));
        } catch (JsonProcessingException failure) { throw unavailable(); }
    }

    private static boolean privateOrLegacyCertificate(String type, SysFile file) {
        if ("PRIVATE".equals(file.getAccessType())) return file.getUrl() == null || file.getUrl().isBlank()
                || legacyCertificate(type, file);
        return "PUBLIC".equals(file.getAccessType()) && legacyCertificate(type, file);
    }

    // 历史 HR PDF 仍需先通过上游业务绑定核验；旧地址仅识别来源，绝不返回给客户端。
    private static boolean legacyCertificate(String type, SysFile file) {
        return Set.of("HR_EMPLOYEE_CERTIFICATE", "HR_TRAINING_CERTIFICATE").contains(type)
                && "application/pdf".equals(file.getFileType()) && "hr-pdf".equals(file.getRemark())
                && file.getConfigId() == null && file.getUrl() != null
                && file.getUrl().matches("/hr/ess/files/[0-9]{4}/(0[1-9]|1[0-2])/[a-f0-9]{32}\\.pdf");
    }

    private static Set<String> purpose(String type) {
        if (type.startsWith("HR_GRIEVANCE_")) return Set.of("HR_GRIEVANCE", "HR_GRIEVANCE_EVIDENCE");
        if (type.startsWith("HR_REFERRAL_RESUME_")) return Set.of("HR_REFERRAL_RESUME");
        if (type.startsWith("HR_TAX_PROOF_")) return Set.of("HR_TAX_PROOF");
        if (Set.of("HR_EMPLOYEE_CERTIFICATE", "HR_TRAINING_CERTIFICATE").contains(type)) return Set.of("application/pdf");
        return type.startsWith("HR_LEAVE_PROOF_") ? Set.of("HR_LEAVE_PROOF") : Set.of(type);
    }

    private static ServiceException unavailable() { return new ServiceException("人事附件授权暂不可用，请稍后重试", 503); }
}
