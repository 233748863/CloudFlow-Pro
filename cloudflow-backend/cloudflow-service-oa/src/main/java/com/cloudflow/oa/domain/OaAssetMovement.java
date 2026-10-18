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
@TableName("oa_asset_movement")
public class OaAssetMovement implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long movementId;

    private Long tenantId;

    private String movementNo;

    private Long assetId;

    private String purpose;

    private Long fromCustodianId;

    private String fromCustodianName;

    private Long toCustodianId;

    private String toCustodianName;

    private Long fromDeptId;

    private Long toDeptId;

    private String fromLocation;

    private String toLocation;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate movementDate;

    private String reason;

    private String attachmentUrl;

    private String status;

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
