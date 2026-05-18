package com.cloudflow.crm.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("crm_approval")
public class CrmApproval implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long approvalId;
    private Long tenantId;
    private String approvalNo;
    private String businessType;
    private String actionType;
    private String businessRefType;
    private Long businessRefId;
    private String businessRefName;
    private String payloadJson;
    private Long applicantId;
    private String applicantName;
    private Long deptId;
    private String deptName;
    private String status;
    private String instanceId;
    private String approvalComment;
    private String remark;
    private Integer deleted;
    private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
