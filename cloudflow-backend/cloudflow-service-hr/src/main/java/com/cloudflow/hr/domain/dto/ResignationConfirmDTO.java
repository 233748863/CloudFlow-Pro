package com.cloudflow.hr.domain.dto;

import lombok.Data;

import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;

/**
 * 确认离职DTO
 * 
 * @author CloudFlow
 */
@Data
public class ResignationConfirmDTO {
    
    /**
     * 离职申请ID
     */
    @NotNull(message = "离职申请ID不能为空")
    private Long applicationId;
    
    /**
     * 实际离职日期
     */
    @NotNull(message = "实际离职日期不能为空")
    private LocalDate actualDate;
}
