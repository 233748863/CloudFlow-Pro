package com.cloudflow.crm.domain.dto;

import lombok.Data;

import java.io.Serializable;

@Data
public class ApprovalResultDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long tenantId;
    private String processInstanceId;
    private String businessType;
    private Long businessId;
    private String businessNo;
    private String approvalResult;
    private String approvalComment;
    private Long approverId;
    private String approverName;
    private Long approvalTime;
}
