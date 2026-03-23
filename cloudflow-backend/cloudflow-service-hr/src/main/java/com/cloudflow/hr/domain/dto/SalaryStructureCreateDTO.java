package com.cloudflow.hr.domain.dto;

import lombok.Data;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;

/**
 * 薪资结构创建DTO
 */
@Data
public class SalaryStructureCreateDTO {
    
    /**
     * 结构编码（唯一标识）
     */
    @NotBlank(message = "结构编码不能为空")
    private String structureCode;
    
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
     * 薪资项目ID列表
     */
    @NotNull(message = "薪资项目列表不能为空")
    private List<Long> itemIds;
}
