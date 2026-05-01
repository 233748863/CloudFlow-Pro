package com.cloudflow.auth.service;

import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.domain.dto.UserInfo;
import java.util.List;

public interface ISysUserService {
    List<SysUser> selectUserList(SysUser user);
    SysUser selectUserById(Long userId);
    SysUser selectUserByUserName(String userName);
    int insertUser(SysUser user);
    int updateUser(SysUser user);
    int deleteUserByIds(Long[] userIds);
    int resetPwd(Long userId, String password);
    String checkUserNameUnique(SysUser user);
    String checkPhoneUnique(SysUser user);
    String checkEmailUnique(SysUser user);
    String selectUserRoleGroup(String userName);

    /**
     * 获取用户完整信息（含角色+权限），带 Spring Cache 缓存
     * 参考 Poco 的 findUserInfo 模式
     */
    UserInfo findUserInfo(String username);

    /**
     * 获取指定租户内的用户完整信息（含角色+权限），带 Spring Cache 缓存
     */
    UserInfo findUserInfo(String username, Long tenantId);

    /**
     * 清除指定用户的信息缓存
     */
    void evictUserInfoCache(String username);

    /**
     * 清除指定租户内用户的信息缓存
     */
    void evictUserInfoCache(String username, Long tenantId);

    /**
     * 根据用户ID列表批量查询用户
     * 
     * @param userIds 用户ID列表
     * @return 用户列表
     */
    List<SysUser> selectUserByIds(List<Long> userIds);
}
