package com.cloudflow.auth.domain.dto;

import lombok.Data;

import java.util.Set;

/**
 * 在线用户视图对象。
 */
@Data
public class OnlineUserDTO {

    /** 当前会话 Token */
    private String token;

    /** 用户基础信息 */
    private Long userId;
    private String username;
    private String nickName;
    private Long deptId;
    private String deptName;
    private Long tenantId;
    private String avatar;
    private Set<String> roles;

    /** 登录时间与过期信息，统一使用时间戳便于前端本地格式化 */
    private Long loginTime;
    private Long expireTime;
    private Long remainingSeconds;

    /** 是否当前会话，用于前端禁用“强制下线自己” */
    private Boolean currentLogin;
}
