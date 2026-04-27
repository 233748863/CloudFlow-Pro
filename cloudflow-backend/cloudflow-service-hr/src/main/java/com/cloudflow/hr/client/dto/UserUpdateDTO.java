package com.cloudflow.hr.client.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.List;

/**
 * 用户更新DTO
 * 用于调用Auth服务更新用户信息
 *
 * @author CloudFlow
 * @since 1.0.0
 */
@Data
public class UserUpdateDTO implements Serializable {
    
    private static final long serialVersionUID = 1L;
    
    /**
     * 部门ID
     */
    private Long deptId;

    /**
     * 是否按本次请求强制同步部门ID，允许把部门清空为null
     */
    private Boolean forceDeptSync;
    
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
