package com.cloudflow.oa.domain;

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

@Data
@TableName("sys_vehicle_maintenance")
public class VehicleMaintenance {

    @TableId(type = IdType.AUTO)
    private Long maintenanceId;

    private Long tenantId;

    private Long vehicleId;

    private String maintenanceType;

    private String status;

    private String title;

    private String description;

    private String providerName;

    private BigDecimal costAmount;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate maintenanceDate;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate nextMaintenanceDate;

    private BigDecimal mileageAtService;

    private BigDecimal nextMaintenanceMileage;

    private String attachmentUrl;

    @TableLogic
    private String delFlag;

    private String createBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    private String updateBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;

    @TableField(exist = false)
    private String vehiclePlate;
}
