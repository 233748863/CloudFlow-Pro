package com.cloudflow.hr.client.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.List;

/**
 * 用户创建DTO
 * 用于调用Auth服务创建用户账号
 *
 * @author CloudFlow
 * @since 1.0.0
 */
@Data
public class UserCreateDTO implements Serializable {
    
    private static final long serialVersionUID = 1L;
    
    /**
     * 租户ID
     */
    private Long tenantId;
    
    /**
     * 部门ID
     */
    private Long deptId;
    
    /**
     * 用户账号
     */
    private String userName;
    
    /**
     * 用户昵称
     */
    private String nickName;
    
    /**
     * 用户邮箱
     */
    private String email;
    
    /**
     * 手机号码
     */
    private String phonenumber;
    
    /**
     * 用户性别（0男 1女 2未知）
     */
    private String sex;
    
    /**
     * 密码
     */
    private String password;
    
    /**
     * 帐号状态（0正常 1停用）
     */
    private Integer status;
    
    /**
     * 岗位ID列表
     */
    private List<Long> postIds;
    
    /**
     * 角色ID列表
     */
    private List<Long> roleIds;
}
