package com.cloudflow.hr.domain.dto;

import lombok.Data;

import jakarta.validation.constraints.NotNull;

/**
 * 完成交接DTO
 * 
 * @author CloudFlow
 */
@Data
public class HandoverCompleteDTO {
    
    /**
     * 交接ID
     */
    @NotNull(message = "交接ID不能为空")
    private Long handoverId;
    
    /**
     * 备注
     */
    private String remark;
}
