package com.cloudflow.hr.client.vo;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

import java.io.Serializable;
import java.util.List;

/**
 * 部门信息VO
 * 从Auth服务获取的部门信息
 *
 * @author CloudFlow
 * @since 1.0.0
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class DeptVO implements Serializable {
    
    private static final long serialVersionUID = 1L;
    
    /**
     * 部门ID
     */
    private Long deptId;
    
    /**
     * 租户ID
     */
    private Long tenantId;
    
    /**
     * 父部门ID
     */
    private Long parentId;
    
    /**
     * 祖级列表
     */
    private String ancestors;
    
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
     * 联系电话
     */
    private String phone;
    
    /**
     * 邮箱
     */
    private String email;
    
    /**
     * 部门状态（0正常 1停用）
     */
    private Integer status;
    
    /**
     * 创建时间
     */
    private String createTime;

    /**
     * 子部门列表
     */
    private List<DeptVO> children;
}
