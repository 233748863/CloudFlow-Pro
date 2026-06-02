package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.Version;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 用车申请与记录实体
 */
@Data
@TableName("oa_vehicle_usage")
public class VehicleUsage {

    @TableId(type = IdType.AUTO)
    private Long usageId;

    private Long vehicleId;

    private Long applicantId;

    private Long driverId;

    /** 司机模式(0自驾 1派司机) */
    private Integer driverMode;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime startTime;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime endTime;

    private String destination;

    /** 还车地点 */
    private String returnLocation;

    /** 是否往返(0单程 1往返) */
    private Integer isRoundTrip;

    private String reason;

    private Integer passengerCount;

    private String passengers;

    /** 附件URL */
    private String attachmentUrl;

    private BigDecimal startMileage;

    private BigDecimal endMileage;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime actualStartTime;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime actualEndTime;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime dispatchTime;

    private String dispatchRemark;

    private String returnRemark;

    /** 状态（0待审批 1已批准 2已驳回 3进行中 4已完成 5已取消） */
    private String status;

    private String processInstanceId;

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
    
    /** 租户ID */
    private Long tenantId;
    
    // 关联字段，非数据库字段
    @TableField(exist = false)
    private String vehiclePlate;
    
    @TableField(exist = false)
    private String applicantName;
    
    @TableField(exist = false)
    private String driverName;

    @TableField(exist = false)
    private BigDecimal totalExpenseAmount;

    @TableField(exist = false)
    private BigDecimal tripDistance;
}
