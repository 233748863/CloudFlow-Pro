package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * OA 业务合同台账。
 */
@Data
@TableName("oa_contract")
public class OaContract implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long contractId;

    private Long tenantId;
    private String contractNo;
    private String contractName;
    private String counterpartyName;
    private String contractType;
    private BigDecimal amount;
    private String currency;
    private Long ownerId;
    private String ownerName;
    private Long deptId;
    private String deptName;
    private Long projectId;
    private String projectName;
    private Long customerId;
    private String customerName;
    private String budgetSubjectCode;
    private String budgetSubjectName;
    private String invoiceStatus;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate startDate;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate endDate;

    private String attachmentUrl;
    private String archiveAttachmentUrl;
    private String instanceId;
    private Long sealApplicationId;
    private String status;
    private String riskLevel;
    private String remark;
    private String sourceType;
    private Long sourceId;
    private Long templateId;
    private Integer deleted;
    @Version
    private Integer version;
    private String createBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    private String updateBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
