package com.cloudflow.hr.domain.dto;

import lombok.Data;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * 职位更新DTO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class PositionUpdateDTO {
    
    /**
     * 职位名称
     */
    @NotBlank(message = "职位名称不能为空")
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
    @NotNull(message = "状态不能为空")
    private Integer status;
}
