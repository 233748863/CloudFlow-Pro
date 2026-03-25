package com.cloudflow.hr.domain.dto;

import lombok.Data;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * 薪资项目创建DTO
 */
@Data
public class SalaryItemCreateDTO {
    
    /**
     * 项目编码（唯一标识）
     */
    @NotBlank(message = "项目编码不能为空")
    private String itemCode;
    
    /**
     * 项目名称
     */
    @NotBlank(message = "项目名称不能为空")
    private String itemName;
    
    /**
     * 项目类型：FIXED-固定项 VARIABLE-浮动项
     */
    @NotBlank(message = "项目类型不能为空")
    private String itemType;
    
    /**
     * 分类：BASIC-基本工资 ALLOWANCE-津贴 BONUS-奖金 DEDUCTION-扣款 INSURANCE-社保 TAX-个税
     */
    @NotBlank(message = "分类不能为空")
    private String category;
    
    /**
     * 是否计税：0-否 1-是
     */
    @NotNull(message = "是否计税不能为空")
    private Boolean isTaxable;
    
    /**
     * 计算公式（支持表达式）
     */
    private String formula;
    
    /**
     * 排序号
     */
    private Integer sortOrder;

    /**
     * 状态：0-禁用 1-启用
     */
    private Integer status;
}
