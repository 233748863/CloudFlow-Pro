package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 职位实体类
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
@TableName("hr_position")
public class Position {
    
    /**
     * 主键ID
     */
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;
    
    /**
     * 租户ID
     */
    private Long tenantId;
    
    /**
     * 职位编码
     */
    private String positionCode;
    
    /**
     * 职位名称
     */
    private String positionName;
    
    /**
     * 职位族ID
     */
    private Long familyId;
    
    /**
     * 职级ID
     */
    private Long levelId;
    
    /**
     * 岗位ID（关联Auth服务的sys_post）
     */
    private Long postId;
    
    /**
     * 岗位职责
     */
    private String jobDescription;
    
    /**
     * 任职要求
     */
    private String requirements;
    
    /**
     * 工作内容
     */
    private String workContent;
    
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
