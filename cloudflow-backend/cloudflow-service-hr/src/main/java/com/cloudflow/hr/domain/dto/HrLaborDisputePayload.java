package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.common.encrypt.annotation.EncryptField;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("hr_labor_dispute")
public class HrLaborDisputePayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String disputeNo;
    private Long applicantEmployeeId;
    private String applicantExternalName;

    @EncryptField
    private String applicantExternalPhone;

    private String disputeType;
    private BigDecimal claimAmount;
    private String claimDescription;
    private String status;
    private String processInstanceId;
    private LocalDate openedAt;
    private LocalDate closedAt;
    private String remark;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    private Integer version;
}
