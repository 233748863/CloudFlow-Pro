package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 个税配置实体类
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Data
@TableName("hr_tax_config")
public class TaxConfig {
    
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
     * 起征点（个税免征额）
     */
    private BigDecimal threshold;
    
    /**
     * 税率表（JSON格式）
     * 格式示例：[{"min":0,"max":36000,"rate":0.03,"deduction":0},{"min":36000,"max":144000,"rate":0.10,"deduction":2520}]
     */
    private String taxBrackets;
    
    /**
     * 专项附加扣除项目（JSON格式）
     * 格式示例：{"CHILD_EDU":1000,"CONTINUING_EDU":400,"MEDICAL":0,"HOUSING_LOAN":1000,"HOUSING_RENT":0,"ELDERLY_CARE":2000}
     */
    private String deductionItems;
    
    /**
     * 生效日期
     */
    private LocalDate effectiveDate;
    
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
     * 创建人
     */
    @TableField(fill = FieldFill.INSERT)
    private Long createBy;
    
    /**
     * 更新人
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private Long updateBy;
    
    /**
     * 删除标志：0-未删除 1-已删除
     */
    @TableLogic
    private Integer deleted;
}
