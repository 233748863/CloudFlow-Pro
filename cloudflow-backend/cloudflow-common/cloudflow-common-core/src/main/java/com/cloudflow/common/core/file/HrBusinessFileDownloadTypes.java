package com.cloudflow.common.core.file;

import java.util.Set;

/** 由 HR 原业务守卫授权、auth 原配置存储读取的下载专用类型。 */
public final class HrBusinessFileDownloadTypes {
    public static final Set<String> ALL = Set.of(
            "HR_EMPLOYEE_CONTRACT", "HR_EMPLOYEE_DOCUMENT", "HR_ATTENDANCE_APPEAL",
            "HR_DISPUTE_MEDIATION", "HR_DISPUTE_ARBITRATION");

    private HrBusinessFileDownloadTypes() { }
}
