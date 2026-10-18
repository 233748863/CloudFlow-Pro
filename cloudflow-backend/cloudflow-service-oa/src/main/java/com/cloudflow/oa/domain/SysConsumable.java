package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.Version;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 耗材库存
 */
@Data
@TableName("oa_consumable")
@JsonInclude(JsonInclude.Include.NON_NULL)
public class SysConsumable {
    
    @TableId(type = IdType.AUTO)
    private Long consumableId;
    
    private String name;
    
    private String model;
    
    private String unit;
    
    private Integer quantity;
    
    private Integer lowStockThreshold;

    private Long defaultSupplierId;

    private Integer targetStock;

    private Integer warnEnabled;

    private Long categoryId;

    private String brand;

    private Integer maxStock;

    @JsonSerialize(using = ToStringSerializer.class)
    private BigDecimal avgCost;

    @JsonSerialize(using = ToStringSerializer.class)
    private BigDecimal stockAmount;

    @JsonSerialize(using = ToStringSerializer.class)
    private BigDecimal lastPurchasePrice;

    private String storageLocation;

    private String status;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime lastCalcTime;

    @Version
    private Integer version;

    @TableField(fill = FieldFill.INSERT)
    private Integer deleted;
    
    private Long tenantId;
    
    @TableField(fill = FieldFill.INSERT)
    private String createBy;
    
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")

    
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
