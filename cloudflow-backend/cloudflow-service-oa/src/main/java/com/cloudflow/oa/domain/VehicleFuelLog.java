package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * OA-P0-1 车辆油耗记录实体。
 */
@Data
@TableName("oa_vehicle_fuel_log")
public class VehicleFuelLog {

    @TableId(type = IdType.AUTO)
    private Long fuelLogId;

    private Long tenantId;

    private Long vehicleId;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate fuelDate;

    /** 燃料类型: 汽油92 / 汽油95 / 汽油98 / 柴油 / 电 */
    private String fuelType;

    private BigDecimal liters;

    private BigDecimal unitPrice;

    private BigDecimal totalAmount;

    private BigDecimal startMileage;

    private BigDecimal endMileage;

    private BigDecimal driveDistance;

    private BigDecimal fuelPer100km;

    private String stationName;

    private String receiptUrl;

    private Long driverId;

    private String driverName;

    private String remark;

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

    @TableLogic
    private Integer deleted;

    @TableField(exist = false)
    private String vehiclePlate;
}
