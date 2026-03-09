package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.TableField;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 车辆费用记录实体
 */
@Data
@TableName("sys_vehicle_expense")
public class VehicleExpense {

    @TableId(type = IdType.AUTO)
    private Long expenseId;

    private Long vehicleId;

    private Long usageId;

    /** 费用类型（1油费 2过路费 3停车费 4维修保养 5保险 6其他） */
    private String expenseType;

    private BigDecimal amount;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate expenseDate;

    private String description;

    private String receiptUrl;

    @TableField(fill = FieldFill.INSERT)
    private String createBy;

    @TableField(fill = FieldFill.INSERT)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    
    /** 租户ID */
    private Long tenantId;
    
    @TableField(exist = false)
    private String vehiclePlate;
}
