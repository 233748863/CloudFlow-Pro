package com.cloudflow.oa.domain;

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
@TableName("oa_project")
public class OaProject implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long projectId;
    private Long tenantId;
    private String instanceId;
    private String projectNo;
    private String projectName;
    private String projectType;
    private Long customerId;
    private String customerName;
    private Long contractId;
    private String contractNo;
    private Long ownerId;
    private String ownerName;
    private Long deptId;
    private String deptName;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate startDate;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate endDate;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate actualStartDate;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate actualEndDate;
    private BigDecimal budgetAmount;
    private BigDecimal actualCostAmount;
    private BigDecimal progress;
    private String priority;
    private String status;
    private String riskLevel;
    private String sourceType;
    private Long sourceId;
    private String sourceName;
    private Integer baselineVersion;
    private String attachmentUrl;
    private String remark;
    private String delFlag;
    private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
