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
@TableName("oa_asset_repair")
public class OaAssetRepair implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long repairId;

    private Long tenantId;

    private String repairNo;

    private Long assetId;

    private String assetName;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate failureDate;

    private Long reportBy;

    private String faultDescription;

    private String repairStatus;

    private String actionsPerformed;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate completionDate;

    private BigDecimal downtimeHours;

    private BigDecimal repairCost;

    private Integer capitalizeFlag;

    private Integer lifeExtensionMonths;

    private Long supplierId;

    private String repairerName;

    private String attachmentUrl;

    private String instanceId;

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
}
