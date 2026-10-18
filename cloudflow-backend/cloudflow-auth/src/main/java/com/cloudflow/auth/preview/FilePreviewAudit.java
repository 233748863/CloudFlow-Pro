package com.cloudflow.auth.preview;

import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.file.FilePreviewRequest;
import java.time.LocalDateTime;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class FilePreviewAudit {
    private static final Set<String> RESULTS = Set.of("ISSUED", "UNSUPPORTED", "READ_AUTHORIZED", "DENIED", "RANGE_REJECTED");
    private final SysAuditLogMapper audits;

    public void record(FilePreviewRequest request, Long fileId, String result) {
        if (!RESULTS.contains(result)) throw new IllegalArgumentException("附件预览审计结果无效");
        SysAuditLogEntity entry = new SysAuditLogEntity();
        entry.setTenantId(UserContext.getTenantId());
        entry.setBizModule("auth");
        entry.setAuditName("FILE_PREVIEW");
        entry.setAuditField("file_access");
        entry.setBeforeVal(request == null ? "UNRESOLVED" : request.bizType() + ":" + request.bizId()
                + ":" + request.childId() + ":" + request.versionNo());
        entry.setAfterVal(result + ":" + (fileId == null ? "UNRESOLVED" : fileId));
        entry.setHighRisk(0);
        entry.setRiskLevel("LOW");
        entry.setCreateBy(String.valueOf(UserContext.getUserId()));
        entry.setCreateTime(LocalDateTime.now());
        try {
            if (audits.insert(entry) != 1) throw unavailable();
        } catch (RuntimeException failure) { throw unavailable(); }
    }

    private static ServiceException unavailable() { return new ServiceException("附件预览审计暂不可用", 503); }
}
