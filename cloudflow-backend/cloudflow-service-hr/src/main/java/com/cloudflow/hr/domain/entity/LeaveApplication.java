package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 请假申请实体类
 * 用于记录员工的请假申请信息
 */
@Data
@TableName("hr_leave_application")
public class LeaveApplication {
    
    /**
     * 主键ID
     */
    @TableId(type = IdType.AUTO)
    private Long id;
    
    /**
     * 租户ID（多租户隔离）
     */
    private Long tenantId;
    
    /**
     * 申请编号（唯一标识）
     */
    private String applicationNo;
    
    /**
     * 员工ID
     */
    private Long employeeId;
    
    /**
     * 假期类型ID
     */
    private Long leaveTypeId;
    
    /**
     * 开始时间
     */
    private LocalDateTime startTime;
    
    /**
     * 结束时间
     */
    private LocalDateTime endTime;
    
    /**
     * 请假时长
     */
    private BigDecimal duration;
    
    /**
     * 单位：DAY-天 HOUR-小时
     */
    private String unit;
    
    /**
     * 请假原因
     */
    private String reason;
    
    /**
     * 流程实例ID（工作流服务）
     */
    private String processInstanceId;

    /**
     * 额度分配明细（JSON）
     */
    private String quotaAllocation;
    
    /**
     * 状态：DRAFT-草稿 APPROVING-审批中 APPROVED-已通过 REJECTED-已拒绝 CANCELLED-已撤销
     */
    private String status;
    
    /**
     * 创建时间
     */
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
    
    /**
     * 更新时间
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
    
    /**
     * 创建者
     */
    @TableField(fill = FieldFill.INSERT)
    private String createBy;
    
    /**
     * 更新者
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;
    
    /**
     * 删除标志（0-未删除 1-已删除）
     */
    @TableLogic
    private Integer deleted;
}
