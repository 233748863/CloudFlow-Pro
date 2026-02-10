package com.cloudflow.auth.service;

import com.cloudflow.auth.domain.SysUser;
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
}
