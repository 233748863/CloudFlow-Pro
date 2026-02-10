package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;
import java.math.BigDecimal;
import java.util.Date;

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
    private Date purchaseDate;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private Date insuranceExpiry;

    private String location;

    private String remark;

    @TableLogic
    private String delFlag;

    private String createBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private Date createTime;

    private String updateBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private Date updateTime;
    
    /** 租户ID */
    private Long tenantId;
}
