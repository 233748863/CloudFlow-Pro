package com.cloudflow.hr.domain.dto;

import lombok.Data;

import jakarta.validation.constraints.NotBlank;
import java.util.List;

/**
 * 薪资结构更新DTO
 */
@Data
public class SalaryStructureUpdateDTO {
    
    /**
     * 结构名称
     */
    @NotBlank(message = "结构名称不能为空")
    private String structureName;
    
    /**
     * 描述
     */
    private String description;
    
    /**
     * 状态：0-禁用 1-启用
     */
    private Integer status;
    
    /**
     * 薪资项目ID列表（如果提供，则更新关联关系）
     */
    private List<Long> itemIds;
}
