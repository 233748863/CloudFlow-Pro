package com.cloudflow.crm.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("crm_opportunity")
public class CrmOpportunity implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long opportunityId;
    private Long tenantId;
    private Long customerId;
    private String customerName;
    private String opportunityName;
    private String stage;
    private String source;
    private BigDecimal expectedAmount;
    private BigDecimal winRate;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate expectedSignDate;
    private Long ownerId;
    private String ownerName;
    private Long deptId;
    private String deptName;
    private Long contactId;
    private String contactName;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime latestFollowUpTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime stageChangedTime;
    private String lostReason;
    private String remark;
    private String status;
    private Integer deleted;
    private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
