package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableField;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;
import java.math.BigDecimal;
import java.util.Date;

/**
 * 用车申请与记录实体
 */
@Data
@TableName("sys_vehicle_usage")
public class VehicleUsage {

    @TableId(type = IdType.AUTO)
    private Long usageId;

    private Long vehicleId;

    private Long applicantId;

    private Long driverId;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private Date startTime;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private Date endTime;

    private String destination;

    private String reason;

    private Integer passengerCount;

    private String passengers;

    private BigDecimal startMileage;

    private BigDecimal endMileage;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private Date actualStartTime;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private Date actualEndTime;

    /** 状态（0待审批 1已批准 2已驳回 3进行中 4已完成 5已取消） */
    private String status;

    private String processInstanceId;

    @TableLogic
    private String delFlag;

    private String createBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private Date createTime;

    private String updateBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private Date updateTime;
    
    // 关联字段，非数据库字段
    @TableField(exist = false)
    private String vehiclePlate;
    
    @TableField(exist = false)
    private String applicantName;
    
    @TableField(exist = false)
    private String driverName;
}
