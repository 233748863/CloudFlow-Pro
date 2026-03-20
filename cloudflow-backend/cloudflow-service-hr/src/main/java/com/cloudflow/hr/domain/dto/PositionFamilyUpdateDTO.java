package com.cloudflow.hr.domain.dto;

import lombok.Data;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * 职位族更新DTO
 * 
 * @author CloudFlow
 */
@Data
public class PositionFamilyUpdateDTO {
    
    /**
     * 职位族编码
     */
    @NotBlank(message = "职位族编码不能为空")
    private String familyCode;
    
    /**
     * 职位族名称
     */
    @NotBlank(message = "职位族名称不能为空")
    private String familyName;
    
    /**
     * 职位族描述
     */
    private String description;
    
    /**
     * 排序号
     */
    private Integer sortOrder;
    
    /**
     * 状态：0-禁用 1-启用
     */
    @NotNull(message = "状态不能为空")
    private Integer status;
}
