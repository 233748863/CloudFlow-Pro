package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 薪资结构详情视图对象（包含关联的薪资项目）
 */
@Data
public class SalaryStructureDetailVO {
    
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
     * 关联的薪资项目列表
     */
    private List<SalaryItemVO> items;
    
    /**
     * 创建时间
     */
    private LocalDateTime createTime;
    
    /**
     * 更新时间
     */
    private LocalDateTime updateTime;
}
