package com.cloudflow.hr.domain.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 补卡申请DTO
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Data
public class AttendanceSupplementDTO {
    
    /**
     * 员工ID（可选，如果不传则从当前登录用户获取）
     */
    private Long employeeId;
    
    /**
     * 考勤日期
     */
    @NotNull(message = "考勤日期不能为空")
    private LocalDate attendanceDate;
    
    /**
     * 打卡类型：CHECK_IN-上班打卡 CHECK_OUT-下班打卡
     */
    @NotBlank(message = "打卡类型不能为空")
    private String checkType;
    
    /**
     * 补卡时间
     */
    @NotNull(message = "补卡时间不能为空")
    private LocalDateTime checkTime;
    
    /**
     * 补卡原因
     */
    @NotBlank(message = "补卡原因不能为空")
    private String reason;
}
