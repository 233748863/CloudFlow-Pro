package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 印章续期申请。
 */
@Data
@TableName("oa_seal_renewal")
public class OaSealRenewal implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String instanceId;
    private String renewalNo;
    private Long sealId;
    private String sealName;
    private String sealNo;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate oldIssueDate;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate oldExpireDate;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate newIssueDate;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate newExpireDate;

    private Long applicantId;
    private String applicantName;
    private Long deptId;
    private String deptName;
    private String renewalReason;
    private String attachmentUrl;
    private String status;
    private Integer deleted;
    private String createBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    private String updateBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
