package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 薪资结构视图对象
 */
@Data
public class SalaryStructureVO {
    
    /**
     * 主键ID
     */
    private Long id;
    
    /**
     * 结构编码
     */
    private String structureCode;
    
    /**
     * 结构名称
     */
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
