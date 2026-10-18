package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.*;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

@Data
@TableName("oa_asset")
public class SysAsset implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long assetId;

    private Long tenantId;

    private String assetCode;

    private String name;

    private String model;

    private String status;

    private BigDecimal purchaseAmount;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate purchaseDate;

    private Long ownerId;

    private String location;

    private String remark;

    @TableField(fill = FieldFill.INSERT)
    private Integer deleted;

    @Version
    private Integer version;

    @TableField(fill = FieldFill.INSERT)
    private String createBy;

    @TableField(fill = FieldFill.INSERT)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;

    private Long categoryId;

    private Long custodianId;

    private String custodianName;

    private Long deptId;

    private String deptName;

    private String locationDetail;

    private BigDecimal salvageValue;

    private Integer usefulLifeMonths;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate availableFromDate;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate disposalDate;

    private Integer depreciationFlag;

    private String depreciationMethod;

    private String depreciationFrequency;

    private BigDecimal openingAccumulatedDepreciation;

    private BigDecimal accumulatedDepreciation;

    private BigDecimal netBookValue;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate nextDepreciationDate;

    private Integer depreciationCompletedFlag;

    private String insurancePolicyNo;

    private String insurerName;

    private BigDecimal insuredValue;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate insuranceStartDate;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate insuranceEndDate;

    private Integer insuranceReminderDays;

    private Integer maintenanceRequiredFlag;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate warrantyExpireDate;
}
