package com.cloudflow.hr.client.dto;

import lombok.Data;

import java.io.Serializable;

/**
 * 部门创建DTO
 * 用于调用Auth服务创建部门
 *
 * @author CloudFlow
 * @since 1.0.0
 */
@Data
public class DeptCreateDTO implements Serializable {
    
    private static final long serialVersionUID = 1L;
    
    /**
     * 租户ID
     */
    private Long tenantId;
    
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
}
