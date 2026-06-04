package com.cloudflow.auth.domain.vo;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.time.LocalDateTime;

@Data
public class DictChangeApprovalSummaryVO {

    private Long approvalId;

    private String approvalNo;

    private String dictType;

    private String changeScope;

    private String actionType;

    private String riskLevel;

    private String targetSummary;

    private Long applicantId;

    private String applicantName;

    private Long deptId;

    private String deptName;

    private String status;

    private String instanceId;

    private String approvalComment;

    private String remark;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
