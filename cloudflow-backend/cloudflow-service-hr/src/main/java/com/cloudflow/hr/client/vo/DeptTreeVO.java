package com.cloudflow.hr.client.vo;

import lombok.Data;

import java.io.Serializable;
import java.util.List;

/**
 * 部门树VO
 * 从Auth服务获取的部门树结构
 *
 * @author CloudFlow
 * @since 1.0.0
 */
@Data
public class DeptTreeVO implements Serializable {
    
    private static final long serialVersionUID = 1L;
    
    /**
     * 部门ID
     */
    private Long deptId;
    
    /**
     * 父部门ID
     */
    private Long parentId;
    
    /**
     * 部门名称
     */
    private String deptName;
    
    /**
     * 显示顺序
     */
    private Integer orderNum;
    
    /**
     * 负责人
     */
    private String leader;
    
    /**
     * 部门状态（0正常 1停用）
     */
    private Integer status;
    
    /**
     * 子部门列表
     */
    private List<DeptTreeVO> children;
}
