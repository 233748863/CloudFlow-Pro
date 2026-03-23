package com.cloudflow.hr.domain.dto;

import lombok.Data;

import java.time.LocalDate;

/**
 * 打卡记录查询DTO
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Data
public class AttendanceRecordQueryDTO {
    
    /**
     * 员工ID
     */
    private Long employeeId;
    
    /**
     * 部门ID
     */
    private Long deptId;
    
    /**
     * 开始日期
     */
    private LocalDate startDate;
    
    /**
     * 结束日期
     */
    private LocalDate endDate;
    
    /**
     * 打卡类型：CHECK_IN-上班打卡 CHECK_OUT-下班打卡
     */
    private String checkType;
    
    /**
     * 状态：NORMAL-正常 LATE-迟到 EARLY-早退 MISSING-缺卡 SUPPLEMENT-补卡
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
