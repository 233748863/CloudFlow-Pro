package com.cloudflow.common.core.file;

import com.cloudflow.common.core.exception.ServiceException;
import java.util.Set;

public record FilePreviewRequest(String bizType, String bizId, Long fileId, String reference,
        String slot, Long childId, Integer versionNo, String definitionId, String instanceId,
        String taskId, String fieldPath) {
    private static final Set<String> TYPES = Set.of("PUBLIC", "OA_CONTRACT", "OA_LICENSE", "OA_KNOWLEDGE",
            "OA_EXPENSE", "OA_INVOICE", "HR_RESUME", "OA_CONTRACT_EVIDENCE", "OA_CONTRACT_SIGNED",
            "OA_SUPPLIER_QUALIFICATION", "WORKFLOW_FORM");

    public FilePreviewRequest validated() {
        if (bizType == null || !TYPES.contains(bizType) && !HrFileDownloadTypes.ALL.contains(bizType)
                && !CrmFileDownloadTypes.ALL.contains(bizType) && !OaFileDownloadTypes.ALL.contains(bizType)
                && !HrBusinessFileDownloadTypes.ALL.contains(bizType)) throw invalid();
        if (fileId != null && fileId <= 0 || fileId == null && (reference == null || reference.isBlank())
                || reference != null && (reference.length() > 4096 || reference.isBlank()
                        || reference.chars().anyMatch(character -> character < 32 || character == 127))
                || childId != null && childId <= 0 || versionNo != null && versionNo <= 0) throw invalid();
        if ("PUBLIC".equals(bizType)) {
            if (bizId != null) throw invalid();
        } else if ("WORKFLOW_FORM".equals(bizType)) {
            if (fileId == null || !identifier(bizId) || definitionId != null && !identifier(definitionId)
                    || instanceId != null && !identifier(instanceId) || taskId != null && !identifier(taskId)
                    || fieldPath == null || !fieldPath.matches("[A-Za-z_][A-Za-z0-9_]*(\\[[0-9]{1,3}\\])?(\\.[A-Za-z_][A-Za-z0-9_]*)?")
                    || fieldPath.length() > 120 || !bizId.equals(instanceId == null ? definitionId : instanceId)) throw invalid();
        } else {
            positiveId(bizId);
        }
        if (!"WORKFLOW_FORM".equals(bizType)
                && (definitionId != null || instanceId != null || taskId != null || fieldPath != null)) throw invalid();
        if ("OA_CONTRACT".equals(bizType)) {
            if (!"attachment".equals(slot) && !"archive".equals(slot)) throw invalid();
        } else if (slot != null) throw invalid();
        boolean childRequired = Set.of("OA_EXPENSE", "OA_CONTRACT_EVIDENCE", "OA_SUPPLIER_QUALIFICATION",
                "OA_LICENSE_HANDOVER", "OA_SEAL_HANDOVER", "OA_CONTRACT_MILESTONE",
                "HR_DISPUTE_MEDIATION", "HR_DISPUTE_ARBITRATION").contains(bizType);
        if (childRequired != (childId != null) || versionNo != null && !"OA_KNOWLEDGE".equals(bizType)) throw invalid();
        return this;
    }

    public long businessId() { return positiveId(bizId); }

    private static boolean identifier(String value) {
        return value != null && value.matches("[A-Za-z0-9_-]{1,64}");
    }

    private static long positiveId(String value) {
        if (value == null || !value.matches("[1-9][0-9]{0,18}")) throw invalid();
        try { return Long.parseLong(value); }
        catch (NumberFormatException failure) { throw invalid(); }
    }

    private static ServiceException invalid() { return new ServiceException("附件预览上下文无效，请从原业务记录重新打开", 400); }
}
