package com.cloudflow.oa.domain.dto;

import com.cloudflow.oa.domain.OaLicense;
import com.cloudflow.oa.domain.OaLicenseBorrow;
import com.cloudflow.oa.domain.OaSealApplication;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * 借还管理首页摘要。
 */
@Data
public class OaBorrowManagementSummaryDTO {

    private long pendingBorrowCount;
    private long overdueCount;
    private long expiringLicenseCount;
    private List<OaSealApplication> pendingSealApplications = new ArrayList<>();
    private List<OaLicenseBorrow> pendingLicenseBorrows = new ArrayList<>();
    private List<OaSealApplication> overdueSealApplications = new ArrayList<>();
    private List<OaLicenseBorrow> overdueLicenseBorrows = new ArrayList<>();
    private List<OaLicense> expiringLicenses = new ArrayList<>();
}
