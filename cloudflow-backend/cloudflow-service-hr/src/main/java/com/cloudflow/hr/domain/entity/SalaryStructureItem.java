package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 薪资结构项目关联实体类
 * 用于关联薪资结构和薪资项目
 */
@Data
@TableName("hr_salary_structure_item")
public class SalaryStructureItem {
    
    /**
     * 主键ID
     */
    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 租户ID
     */
    private Long tenantId;
    
    /**
     * 薪资结构ID
     */
    private Long structureId;
    
    /**
     * 薪资项目ID
     */
    private Long itemId;
    
    /**
     * 排序号
     */
    private Integer sortOrder;
    
    /**
     * 创建时间
     */
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
}
