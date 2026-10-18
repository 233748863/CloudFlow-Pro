package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.*;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import lombok.Data;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("oa_consumable_request_item")
@JsonInclude(JsonInclude.Include.NON_NULL)
public class OaConsumableRequestItem implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    @JsonSerialize(using = ToStringSerializer.class)
    private Long itemId;

    @JsonIgnore
    private Long tenantId;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long requestId;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long consumableId;

    private String consumableName;

    private String model;

    private String unit;

    private Integer applyQuantity;

    private Integer approvedQuantity;

    private Integer issuedQuantity;

    private Integer returnedQuantity;

    @JsonSerialize(using = ToStringSerializer.class)
    private BigDecimal unitPrice;

    @JsonSerialize(using = ToStringSerializer.class)
    private BigDecimal amount;

    @JsonSerialize(using = ToStringSerializer.class)
    private BigDecimal issuedAmount;

    @JsonSerialize(using = ToStringSerializer.class)
    private BigDecimal returnedAmount;

    private Integer sortNo;

    private String remark;

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
