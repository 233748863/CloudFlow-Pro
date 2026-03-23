package com.cloudflow.hr.domain.dto;

import lombok.Data;

import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;

/**
 * 创建离职申请DTO
 * 
 * @author CloudFlow
 */
@Data
public class ResignationApplicationCreateDTO {
    
    /**
     * 员工ID
     */
    @NotNull(message = "员工ID不能为空")
    private Long employeeId;
    
    /**
     * 离职类型：VOLUNTARY-主动离职 INVOLUNTARY-被动离职 CONTRACT_EXPIRY-合同到期
     */
    @NotNull(message = "离职类型不能为空")
    private String resignationType;
    
    /**
     * 离职原因
     */
    private String resignationReason;
    
    /**
     * 预计离职日期
     */
    @NotNull(message = "预计离职日期不能为空")
    private LocalDate expectedDate;
}
