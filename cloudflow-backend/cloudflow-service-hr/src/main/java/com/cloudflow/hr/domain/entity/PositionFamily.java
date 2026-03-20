package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 职位族实体类
 * 用于定义职位的分类体系，如技术族、产品族、运营族等
 * 
 * @author CloudFlow
 */
@Data
@TableName("hr_position_family")
public class PositionFamily {
    
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
     * 职位族编码（如：TECH、PRODUCT、OPERATION）
     */
    private String familyCode;
    
    /**
     * 职位族名称（如：技术族、产品族、运营族）
     */
    private String familyName;
    
    /**
     * 职位族描述
     */
    private String description;
    
    /**
     * 排序号（用于显示顺序）
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
}
