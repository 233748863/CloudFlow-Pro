package com.cloudflow.hr.domain.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 查询加班申请DTO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class OvertimeApplicationQueryDTO {

    /**
     * 员工ID
     */
    private Long employeeId;

    /**
     * 加班类型：WORKDAY-工作日 WEEKEND-周末 HOLIDAY-节假日
     */
    private String overtimeType;

    /**
     * 状态：DRAFT-草稿 APPROVING-审批中 APPROVED-已通过 REJECTED-已拒绝
     */
    private String status;

    /**
     * 开始时间（查询范围起始）
     */
    private LocalDateTime startTimeFrom;

    /**
     * 开始时间（查询范围结束）
     */
    private LocalDateTime startTimeTo;

    /**
     * 页码
     */
    private Integer pageNum = 1;

    /**
     * 每页大小
     */
    private Integer pageSize = 10;
}
