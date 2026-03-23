package com.cloudflow.hr.domain.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 请假申请创建DTO
 */
@Data
public class LeaveApplicationCreateDTO {
    
    /**
     * 员工ID
     */
    @NotNull(message = "员工ID不能为空")
    private Long employeeId;
    
    /**
     * 假期类型ID
     */
    @NotNull(message = "假期类型ID不能为空")
    private Long leaveTypeId;
    
    /**
     * 开始时间
     */
    @NotNull(message = "开始时间不能为空")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime startTime;
    
    /**
     * 结束时间
     */
    @NotNull(message = "结束时间不能为空")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime endTime;
    
    /**
     * 请假时长
     */
    @NotNull(message = "请假时长不能为空")
    private BigDecimal duration;
    
    /**
     * 单位：DAY-天 HOUR-小时
     */
    @NotNull(message = "单位不能为空")
    private String unit;
    
    /**
     * 请假原因
     */
    private String reason;
}
