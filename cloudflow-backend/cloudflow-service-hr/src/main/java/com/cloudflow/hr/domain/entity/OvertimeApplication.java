package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 加班申请实体类
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
@TableName("hr_overtime_application")
public class OvertimeApplication {

    /**
     * 主键ID
     */
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    /**
     * 租户ID
     */
    private Long tenantId;

    /**
     * 申请编号
     */
    private String applicationNo;

    /**
     * 员工ID
     */
    private Long employeeId;

    /**
     * 开始时间
     */
    private LocalDateTime startTime;

    /**
     * 结束时间
     */
    private LocalDateTime endTime;

    /**
     * 加班时长（小时）
     */
    private BigDecimal duration;

    /**
     * 加班类型：WORKDAY-工作日 WEEKEND-周末 HOLIDAY-节假日
     */
    private String overtimeType;

    /**
     * 加班原因
     */
    private String reason;

    /**
     * 补偿类型：TIME_OFF-调休 PAYMENT-加班费
     */
    private String compensationType;

    /**
     * 补偿时长（调休小时数）
     */
    private BigDecimal compensationHours;

    /**
     * 流程实例ID
     */
    private String processInstanceId;

    /**
     * 状态：DRAFT-草稿 APPROVING-审批中 APPROVED-已通过 REJECTED-已拒绝
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
