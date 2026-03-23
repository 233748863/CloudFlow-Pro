package com.cloudflow.hr.domain.dto;

import lombok.Data;

import java.time.LocalDate;

/**
 * 查询异常考勤DTO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class AttendanceAnomalyQueryDTO {

    /**
     * 员工ID
     */
    private Long employeeId;

    /**
     * 部门ID
     */
    private Long deptId;

    /**
     * 异常类型：LATE-迟到 EARLY-早退 MISSING-缺卡 ABSENT-旷工
     */
    private String anomalyType;

    /**
     * 开始日期
     */
    private LocalDate startDate;

    /**
     * 结束日期
     */
    private LocalDate endDate;

    /**
     * 页码
     */
    private Integer pageNum = 1;

    /**
     * 每页大小
     */
    private Integer pageSize = 10;
}
