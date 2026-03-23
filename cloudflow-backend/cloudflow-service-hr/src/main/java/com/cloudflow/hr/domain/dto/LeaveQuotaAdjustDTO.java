package com.cloudflow.hr.domain.dto;

import lombok.Data;

import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;

/**
 * 假期额度调整DTO
 */
@Data
public class LeaveQuotaAdjustDTO {
    
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
     * 年度
     */
    @NotNull(message = "年度不能为空")
    private Integer year;
    
    /**
     * 调整额度（正数为增加，负数为减少）
     */
    @NotNull(message = "调整额度不能为空")
    private BigDecimal adjustmentAmount;
    
    /**
     * 调整原因
     */
    private String reason;
}
