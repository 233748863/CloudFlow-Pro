package com.cloudflow.hr.domain.dto;

import lombok.Data;

/**
 * 导出考勤报表DTO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class AttendanceReportExportDTO {

    /**
     * 部门ID（可选，不填则导出所有部门）
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
     * 导出格式：EXCEL-Excel格式 PDF-PDF格式
     */
    private String format = "EXCEL";
}
