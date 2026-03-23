package com.cloudflow.hr.domain.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 请假申请查询DTO
 */
@Data
public class LeaveApplicationQueryDTO {
    
    /**
     * 员工ID
     */
    private Long employeeId;
    
    /**
     * 假期类型ID
     */
    private Long leaveTypeId;
    
    /**
     * 状态
     */
    private String status;
    
    /**
     * 开始时间（查询范围起始）
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime startTimeFrom;
    
    /**
     * 开始时间（查询范围结束）
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
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
