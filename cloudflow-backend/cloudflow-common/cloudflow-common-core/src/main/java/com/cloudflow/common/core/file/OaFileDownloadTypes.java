package com.cloudflow.common.core.file;

import java.util.Set;

/** 仅用于下载的 OA 业务类型，不自动开放预览。 */
public final class OaFileDownloadTypes {
    public static final Set<String> ALL = Set.of(
            "OA_MEETING_ROOM", "OA_RFQ_INVITATION", "OA_RFQ_QUOTATION",
            "OA_LICENSE_BORROW", "OA_SEAL_APPLICATION", "OA_SEAL", "OA_BUSINESS_TRIP",
            "OA_LICENSE_RENEWAL", "OA_SEAL_RENEWAL", "OA_LICENSE_HANDOVER", "OA_SEAL_HANDOVER", "OA_PAYMENT_REQUEST",
            "OA_PURCHASE_REQUEST", "OA_CONTRACT_MILESTONE");

    private OaFileDownloadTypes() { }
}
