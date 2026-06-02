package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("oa_vehicle_violation")
public class VehicleViolation {

    @TableId(type = IdType.AUTO)
    private Long violationId;

    private Long tenantId;

    private Long vehicleId;

    private Long usageId;

    private Long driverId;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime violationTime;

    private String violationAddress;

    private String violationReason;

    private BigDecimal penaltyAmount;

    private Integer points;

    private String status;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime handledTime;

    private Long handlerId;

    private String remark;

    private String attachmentUrl;

    @TableLogic
    private Integer deleted;

    @Version
    private Integer version;
    private String createBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    private String updateBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;

    @TableField(exist = false)
    private String vehiclePlate;

    @TableField(exist = false)
    private String driverName;
}
