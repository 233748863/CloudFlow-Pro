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
@TableName("oa_consumable_ledger")
@JsonInclude(JsonInclude.Include.NON_NULL)
public class OaConsumableLedger implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    @JsonSerialize(using = ToStringSerializer.class)
    private Long ledgerId;

    @JsonIgnore
    private Long tenantId;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long consumableId;

    private String consumableName;

    private String model;

    private String unit;

    private String transactionType;

    private Integer quantity;

    private Integer balanceAfter;

    @JsonSerialize(using = ToStringSerializer.class)
    private BigDecimal unitPrice;

    @JsonSerialize(using = ToStringSerializer.class)
    private BigDecimal amount;

    @JsonSerialize(using = ToStringSerializer.class)
    private BigDecimal balanceAmountAfter;

    @JsonSerialize(using = ToStringSerializer.class)
    private BigDecimal avgCostAfter;

    private String storageLocation;

    private String sourceBizType;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long sourceBizId;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long sourceItemId;

    private String sourceEventKey;

    private String operationKey;

    private Integer operationLineNo;

    @JsonIgnore
    private String operationHash;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long sourceLedgerId;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long reversalOfLedgerId;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long assetLogId;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long beneficiaryId;

    private String beneficiaryName;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long deptId;

    private String deptName;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long operatorId;

    private String operatorName;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime operateTime;

    private String remark;

    @TableField(fill = FieldFill.INSERT)
    private String createBy;

    @TableField(fill = FieldFill.INSERT)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
}
