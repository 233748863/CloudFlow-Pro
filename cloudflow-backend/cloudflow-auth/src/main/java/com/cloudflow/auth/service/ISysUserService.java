package com.cloudflow.auth.service;

import com.cloudflow.auth.domain.SysUser;
import java.util.List;

public interface ISysUserService {
    List<SysUser> selectUserList(SysUser user);
    SysUser selectUserById(Long userId);
    int insertUser(SysUser user);
    int updateUser(SysUser user);
    int deleteUserByIds(Long[] userIds);
    String selectUserRoleGroup(String userName);
}
