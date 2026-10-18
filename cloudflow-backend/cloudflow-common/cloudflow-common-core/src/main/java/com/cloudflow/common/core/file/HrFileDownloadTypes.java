package com.cloudflow.common.core.file;

import java.util.Set;

/** 只用于短期下载，不能借此获得通用文件预览权限。 */
public final class HrFileDownloadTypes {
    public static final Set<String> ALL = Set.of("HR_ATTENDANCE_PHOTO", "HR_GRIEVANCE_MINE",
            "HR_GRIEVANCE_MANAGE", "HR_GRIEVANCE_DISPUTE", "HR_LEAVE_PROOF_MINE", "HR_LEAVE_PROOF_MANAGE",
            "HR_ADVANCE_PROOF", "HR_SETTLEMENT_PROOF", "HR_EXIT_INTERVIEW", "HR_TRAINING_AGREEMENT", "HR_SEVERANCE_POLICY",
            "HR_REFERRAL_RESUME_MINE", "HR_REFERRAL_RESUME_MANAGE", "HR_TAX_PROOF_MINE", "HR_TAX_PROOF_MANAGE",
            "HR_EMPLOYEE_CERTIFICATE", "HR_TRAINING_CERTIFICATE");
    private HrFileDownloadTypes() { }
}
