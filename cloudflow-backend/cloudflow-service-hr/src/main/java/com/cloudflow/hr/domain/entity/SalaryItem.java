package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 薪资项目实体类
 * 用于定义薪资组成项目（如基本工资、津贴、奖金等）
 */
@Data
@TableName("hr_salary_item")
public class SalaryItem {
    
    /**
     * 主键ID
     */
    @TableId(type = IdType.AUTO)
    private Long id;
    
    /**
     * 租户ID（多租户隔离）
     */
    private Long tenantId;
    
    /**
     * 项目编码（唯一标识）
     */
    private String itemCode;
    
    /**
     * 项目名称（如：基本工资、岗位津贴）
     */
    private String itemName;
    
    /**
     * 项目类型：FIXED-固定项 VARIABLE-浮动项
     */
    private String itemType;
    
    /**
     * 分类：BASIC-基本工资 ALLOWANCE-津贴 BONUS-奖金 DEDUCTION-扣款 INSURANCE-社保 TAX-个税
     */
    private String category;
    
    /**
     * 是否计税：0-否 1-是
     */
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
    
    /**
     * 创建时间
     */
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
    
    /**
     * 更新时间
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
    
    /**
     * 创建者
     */
    @TableField(fill = FieldFill.INSERT)
    private String createBy;
    
    /**
     * 更新者
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;
    
    /**
     * 删除标志（0-未删除 1-已删除）
     */
    @TableLogic
    private Boolean deleted;
}
