package com.cloudflow.hr.domain.dto;

import lombok.Data;

/**
 * 查询考勤月报DTO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class AttendanceMonthlyQueryDTO {

    /**
     * 员工ID
     */
    private Long employeeId;

    /**
     * 部门ID
     */
    private Long deptId;

    /**
     * 年份
     */
    private Integer year;

    /**
     * 月份
     */
    private Integer month;

    /**
     * 状态：DRAFT-草稿 CONFIRMED-已确认
     */
    private String status;

    /**
     * 页码
     */
    private Integer pageNum = 1;

    /**
     * 每页大小
     */
    private Integer pageSize = 10;
}
