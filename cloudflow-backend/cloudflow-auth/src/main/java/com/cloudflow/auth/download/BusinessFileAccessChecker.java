package com.cloudflow.auth.download;

import com.cloudflow.auth.preview.FilePreviewResolver;
import com.cloudflow.common.core.file.FilePreviewRequest;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/** 复用业务已注册的记录、字段、文件绑定及当前用户权限校验。 */
@Component
@RequiredArgsConstructor
public class BusinessFileAccessChecker implements FileAccessChecker {
    private final FilePreviewResolver resolver;

    @Override
    public Set<String> businessTypes() {
        return Set.of("PUBLIC", "OA_CONTRACT", "OA_LICENSE", "OA_KNOWLEDGE", "OA_EXPENSE",
                "OA_INVOICE", "HR_RESUME", "OA_CONTRACT_EVIDENCE", "OA_CONTRACT_SIGNED",
                "OA_SUPPLIER_QUALIFICATION", "WORKFLOW_FORM", "OA_MEETING_ROOM",
                "OA_RFQ_INVITATION", "OA_RFQ_QUOTATION", "OA_LICENSE_BORROW", "OA_SEAL_APPLICATION",
                "OA_SEAL", "OA_BUSINESS_TRIP", "OA_LICENSE_RENEWAL", "OA_SEAL_RENEWAL",
                "OA_LICENSE_HANDOVER", "OA_SEAL_HANDOVER", "OA_PAYMENT_REQUEST",
                "OA_PURCHASE_REQUEST", "OA_CONTRACT_MILESTONE",
                "HR_EMPLOYEE_CONTRACT", "HR_EMPLOYEE_DOCUMENT", "HR_ATTENDANCE_APPEAL",
                "HR_DISPUTE_MEDIATION", "HR_DISPUTE_ARBITRATION");
    }

    @Override
    public FilePreviewResolver.Resolved authorize(FilePreviewRequest request) { return resolver.resolveDownload(request); }
}
