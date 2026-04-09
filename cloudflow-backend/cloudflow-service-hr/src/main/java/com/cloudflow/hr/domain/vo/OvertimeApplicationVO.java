package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 加班申请VO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class OvertimeApplicationVO {

    /**
     * 主键ID
     */
    private Long id;

    /**
     * 申请编号
     */
    private String applicationNo;

    /**
     * 员工ID
     */
    private Long employeeId;

    /**
     * 员工姓名
     */
    private String employeeName;

    /**
     * 员工工号
     */
    private String employeeNo;

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
     * 加班类型名称
     */
    private String overtimeTypeName;

    /**
     * 加班原因
     */
    private String reason;

    /**
     * 补偿类型：TIME_OFF-调休 PAYMENT-加班费
     */
    private String compensationType;

    /**
     * 补偿类型名称
     */
    private String compensationTypeName;

    /**
     * 补偿时长（调休小时数）
     */
    private BigDecimal compensationHours;

    /**
     * 流程实例ID
     */
    private String processInstanceId;

    /**
     * 状态：DRAFT-草稿 APPROVING-审批中 APPROVED-已通过 REJECTED-已拒绝 CANCELLED-已撤销
     */
    private String status;

    /**
     * 状态名称
     */
    private String statusName;

    /**
     * 创建时间
     */
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    private LocalDateTime updateTime;
}
