package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableField;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 车辆信息实体
 */
@Data
@TableName("sys_vehicle")
public class SysVehicle {

    @TableId(type = IdType.AUTO)
    private Long vehicleId;

    private String licensePlate;

    private String brand;

    private String model;

    private String color;

    private Integer capacity;

    /** 状态（1可用 2已预约 3使用中 4维修中 5报废） */
    private String status;

    private BigDecimal mileage;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDateTime purchaseDate;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDateTime insuranceExpiry;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDateTime annualInspectionExpiry;

    private BigDecimal maintenanceCycleKm;

    private BigDecimal nextMaintenanceMileage;

    private Long managerUserId;

    private String location;

    private String remark;

    @TableLogic
    private String delFlag;

    private String createBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    private String updateBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
    
    /** 租户ID */
    private Long tenantId;

    @TableField(exist = false)
    private String runtimeStatus;

    @TableField(exist = false)
    private Long currentUsageId;

    @TableField(exist = false)
    private String currentUsageStatus;

    @TableField(exist = false)
    private String currentUserName;

    @TableField(exist = false)
    private String currentDriverName;

    @TableField(exist = false)
    private String currentDestination;

    @TableField(exist = false)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime plannedReturnTime;

    @TableField(exist = false)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime nextBookingStartTime;

    @TableField(exist = false)
    private String warningTags;

    @TableField(exist = false)
    private BigDecimal expenseAmount30d;
}
