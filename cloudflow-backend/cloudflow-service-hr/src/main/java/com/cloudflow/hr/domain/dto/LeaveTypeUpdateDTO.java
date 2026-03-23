package com.cloudflow.hr.domain.dto;

import lombok.Data;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * 假期类型更新DTO
 */
@Data
public class LeaveTypeUpdateDTO {
    
    /**
     * 假期名称
     */
    @NotBlank(message = "假期名称不能为空")
    private String leaveName;
    
    /**
     * 是否需要额度
     */
    @NotNull(message = "是否需要额度不能为空")
    private Boolean needQuota;
    
    /**
     * 是否带薪
     */
    @NotNull(message = "是否带薪不能为空")
    private Boolean isPaid;
    
    /**
     * 计算单位：DAY-天 HOUR-小时
     */
    @NotBlank(message = "计算单位不能为空")
    private String unit;
    
    /**
     * 额度规则（JSON格式）
     */
    private String quotaRule;
    
    /**
     * 过期规则（JSON格式）
     */
    private String expiryRule;
    
    /**
     * 状态：0-禁用 1-启用
     */
    private Integer status;
}
