package com.cloudflow.crm.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("oa_crm_sales_target")
public class CrmSalesTarget implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long salesTargetId;
    private Long tenantId;
    private String targetNo;
    private String targetName;
    private String dimensionType;
    private String periodType;
    private Integer targetYear;
    private Integer targetPeriod;
    private Long deptId;
    private String deptName;
    private Long ownerId;
    private String ownerName;
    private BigDecimal targetAmount;
    private String status;
    private String remark;
    private String delFlag;
    private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;

    @TableField(exist = false)
    private BigDecimal achievedAmount;

    @TableField(exist = false)
    private BigDecimal completionRate;

    @TableField(exist = false)
    private BigDecimal gapAmount;

    @TableField(exist = false)
    private String periodLabel;
}
