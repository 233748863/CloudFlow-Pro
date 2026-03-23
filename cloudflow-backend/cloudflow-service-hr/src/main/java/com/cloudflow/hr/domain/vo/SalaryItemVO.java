package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 薪资项目视图对象
 */
@Data
public class SalaryItemVO {
    
    /**
     * 主键ID
     */
    private Long id;
    
    /**
     * 项目编码
     */
    private String itemCode;
    
    /**
     * 项目名称
     */
    private String itemName;
    
    /**
     * 项目类型：FIXED-固定项 VARIABLE-浮动项
     */
    private String itemType;
    
    /**
     * 项目类型描述
     */
    private String itemTypeDesc;
    
    /**
     * 分类：BASIC-基本工资 ALLOWANCE-津贴 BONUS-奖金 DEDUCTION-扣款 INSURANCE-社保 TAX-个税
     */
    private String category;
    
    /**
     * 分类描述
     */
    private String categoryDesc;
    
    /**
     * 是否计税：0-否 1-是
     */
    private Boolean isTaxable;
    
    /**
     * 计算公式
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
    
    /**
     * 状态描述
     */
    private String statusDesc;
    
    /**
     * 创建时间
     */
    private LocalDateTime createTime;
    
    /**
     * 更新时间
     */
    private LocalDateTime updateTime;
}
