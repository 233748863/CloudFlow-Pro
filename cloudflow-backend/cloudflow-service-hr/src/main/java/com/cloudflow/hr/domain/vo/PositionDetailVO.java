package com.cloudflow.hr.domain.vo;

import com.cloudflow.hr.client.vo.DeptVO;
import com.cloudflow.hr.client.vo.PostVO;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 职位详情VO（包含关联信息）
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class PositionDetailVO {
    
    /**
     * 主键ID
     */
    private Long id;
    
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
     * 职位族信息
     */
    private PositionFamilyVO family;
    
    /**
     * 职级ID
     */
    private Long levelId;
    
    /**
     * 职级信息
     */
    private JobLevelVO level;
    
    /**
     * 岗位ID
     */
    private Long postId;
    
    /**
     * 岗位信息（从Auth服务获取）
     */
    private PostVO post;
    
    /**
     * 部门信息（从岗位关联的部门获取）
     */
    private DeptVO dept;
    
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
    private LocalDateTime createTime;
    
    /**
     * 更新时间
     */
    private LocalDateTime updateTime;
}
