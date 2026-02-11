package com.cloudflow.auth.domain.dto;

import com.cloudflow.auth.domain.SysUser;

import java.io.Serializable;
import java.util.Set;

/**
 * 用户信息缓存载体（参考 Poco 的 UserInfo DTO）
 * 包含用户基本信息 + 角色集合 + 权限集合
 * 用于 Spring Cache 按 username 缓存
 */
public class UserInfo implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 用户基本信息
     */
    private SysUser sysUser;

    /**
     * 角色标识集合（roleKey，如 admin / common）
     */
    private Set<String> roles;

    /**
     * 权限标识集合（如 system:user:list）
     */
    private Set<String> permissions;

    public UserInfo() {
    }

    public UserInfo(SysUser sysUser, Set<String> roles, Set<String> permissions) {
        this.sysUser = sysUser;
        this.roles = roles;
        this.permissions = permissions;
    }

    public SysUser getSysUser() {
        return sysUser;
    }

    public void setSysUser(SysUser sysUser) {
        this.sysUser = sysUser;
    }

    public Set<String> getRoles() {
        return roles;
    }

    public void setRoles(Set<String> roles) {
        this.roles = roles;
    }

    public Set<String> getPermissions() {
        return permissions;
    }

    public void setPermissions(Set<String> permissions) {
        this.permissions = permissions;
    }
}
