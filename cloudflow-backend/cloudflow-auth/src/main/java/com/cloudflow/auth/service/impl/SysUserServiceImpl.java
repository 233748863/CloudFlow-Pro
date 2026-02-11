package com.cloudflow.auth.service.impl;

import cn.hutool.crypto.digest.BCrypt;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.SysDept;
import com.cloudflow.auth.domain.SysRole;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.domain.SysUserRole;
import com.cloudflow.auth.domain.SysUserPost;
import com.cloudflow.auth.mapper.SysDeptMapper;
import com.cloudflow.auth.mapper.SysRoleMapper;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.auth.mapper.SysUserPostMapper;
import com.cloudflow.auth.mapper.SysUserRoleMapper;
import com.cloudflow.auth.service.ISysUserService;
import com.cloudflow.common.core.context.UserContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class SysUserServiceImpl implements ISysUserService {

    @Autowired
    private SysUserMapper sysUserMapper;

    @Autowired
    private SysUserRoleMapper sysUserRoleMapper;

    @Autowired
    private SysUserPostMapper sysUserPostMapper;

    @Autowired
    private SysRoleMapper sysRoleMapper;

    @Autowired
    private SysDeptMapper sysDeptMapper;

    @Override
    public List<SysUser> selectUserList(SysUser user) {
        // 多租户隔离：添加租户ID过滤
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<>();
        
        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            wrapper.eq(SysUser::getTenantId, tenantId);
        }
        
        if (user.getDeptId() != null && user.getDeptId() > 0) {
            wrapper.eq(SysUser::getDeptId, user.getDeptId());
        }
        if (StringUtils.hasText(user.getUserName())) {
            wrapper.like(SysUser::getUserName, user.getUserName());
        }
        if (StringUtils.hasText(user.getPhonenumber())) {
            wrapper.like(SysUser::getPhonenumber, user.getPhonenumber());
        }
        if (StringUtils.hasText(user.getStatus())) {
            wrapper.eq(SysUser::getStatus, user.getStatus());
        }
        
        List<SysUser> users = sysUserMapper.selectList(wrapper);
        
        // 为每个用户填充角色和部门名称信息
        for (SysUser u : users) {
            List<SysRole> roles = selectRolesByUserId(u.getUserId());
            if (!roles.isEmpty()) {
                u.setRole(roles.get(0).getRoleName());
                u.setRoleIds(roles.stream().map(SysRole::getRoleId).toArray(Long[]::new));
            }
            // 填充部门名称
            if (u.getDeptId() != null && u.getDeptId() > 0) {
                SysDept dept = sysDeptMapper.selectById(u.getDeptId());
                if (dept != null) {
                    u.setDeptName(dept.getDeptName());
                }
            }
        }
        
        return users;
    }

    @Override
    public SysUser selectUserById(Long userId) {
        // 多租户隔离：添加租户ID过滤
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysUser::getUserId, userId);
        
        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            wrapper.eq(SysUser::getTenantId, tenantId);
        }
        
        SysUser user = sysUserMapper.selectOne(wrapper);
        if (user != null) {
            // Fill roles
            List<SysRole> roles = selectRolesByUserId(userId);
            if (!roles.isEmpty()) {
                user.setRole(roles.get(0).getRoleKey()); 
                user.setRoleIds(roles.stream().map(SysRole::getRoleId).toArray(Long[]::new));
            }
        }
        return user;
    }

    @Override
    public SysUser selectUserByUserName(String userName) {
        // 多租户隔离：添加租户ID过滤
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysUser::getUserName, userName);
        
        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            wrapper.eq(SysUser::getTenantId, tenantId);
        }
        
        return sysUserMapper.selectOne(wrapper);
    }
    
    private List<SysRole> selectRolesByUserId(Long userId) {
        LambdaQueryWrapper<SysUserRole> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysUserRole::getUserId, userId);
        List<SysUserRole> urs = sysUserRoleMapper.selectList(wrapper);
        if (urs.isEmpty()) return new ArrayList<>();
        
        List<Long> roleIds = urs.stream().map(SysUserRole::getRoleId).collect(Collectors.toList());
        return sysRoleMapper.selectBatchIds(roleIds);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int insertUser(SysUser user) {
        user.setCreateTime(new Date());
        
        // 多租户隔离：设置租户ID
        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            user.setTenantId(tenantId);
        }
        
        // 前端发送的是 SHA-256 哈希后的密码，后端需要对其再次 BCrypt 加密
        if (StringUtils.hasText(user.getPassword())) {
            user.setPassword(BCrypt.hashpw(user.getPassword(), BCrypt.gensalt()));
        } else {
            // 默认密码: SHA-256("123456") 再 BCrypt 加密，与前端加密流程保持一致
            String defaultPwdSha256 = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";
            user.setPassword(BCrypt.hashpw(defaultPwdSha256, BCrypt.gensalt()));
        }
        
        int result = sysUserMapper.insert(user);
        
        // 为新用户分配默认角色（普通用户角色）
        if (result > 0) {
            // 查找 'common' 角色
            SysRole defaultRole = sysRoleMapper.selectOne(
                new LambdaQueryWrapper<SysRole>()
                    .eq(SysRole::getRoleKey, "common")
                    .last("LIMIT 1")
            );
            
            if (defaultRole != null) {
                SysUserRole userRole = new SysUserRole();
                userRole.setUserId(user.getUserId());
                userRole.setRoleId(defaultRole.getRoleId());
                sysUserRoleMapper.insert(userRole);
            }
            
            // 如果指定了其他角色，也插入
            insertUserRole(user);
        }
        
        return result;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int updateUser(SysUser user) {
        // 多租户隔离：验证租户ID
        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            LambdaQueryWrapper<SysUser> checkWrapper = new LambdaQueryWrapper<>();
            checkWrapper.eq(SysUser::getUserId, user.getUserId())
                       .eq(SysUser::getTenantId, tenantId);
            if (sysUserMapper.selectCount(checkWrapper) == 0) {
                throw new RuntimeException("无权修改此用户");
            }
        }
        
        if (StringUtils.hasText(user.getPassword())) {
            // 前端发送的密码已经是 SHA-256 哈希，后端再次使用 BCrypt 加密
            user.setPassword(BCrypt.hashpw(user.getPassword(), BCrypt.gensalt()));
        } else {
            // 不更新密码
            user.setPassword(null);
        }
        
        int rows = sysUserMapper.updateById(user);
        
        // 更新角色（删除后重新插入）
        LambdaQueryWrapper<SysUserRole> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysUserRole::getUserId, user.getUserId());
        sysUserRoleMapper.delete(wrapper);
        
        insertUserRole(user);
        
        return rows;
    }
    
    private void insertUserRole(SysUser user) {
        Long[] roleIds = user.getRoleIds();
        if (roleIds != null && roleIds.length > 0) {
            for (Long roleId : roleIds) {
                SysUserRole ur = new SysUserRole();
                ur.setUserId(user.getUserId());
                ur.setRoleId(roleId);
                sysUserRoleMapper.insert(ur);
            }
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int deleteUserByIds(Long[] userIds) {
        // 多租户隔离：只删除当前租户的用户
        Long tenantId = UserContext.getTenantId();
        
        for (Long userId : userIds) {
            LambdaQueryWrapper<SysUser> userWrapper = new LambdaQueryWrapper<>();
            userWrapper.eq(SysUser::getUserId, userId);
            if (tenantId != null) {
                userWrapper.eq(SysUser::getTenantId, tenantId);
            }
            sysUserMapper.delete(userWrapper);
            
            // 删除用户角色关联
            LambdaQueryWrapper<SysUserRole> roleWrapper = new LambdaQueryWrapper<>();
            roleWrapper.eq(SysUserRole::getUserId, userId);
            sysUserRoleMapper.delete(roleWrapper);
            
            // 删除用户岗位关联
            LambdaQueryWrapper<SysUserPost> postWrapper = new LambdaQueryWrapper<>();
            postWrapper.eq(SysUserPost::getUserId, userId);
            sysUserPostMapper.delete(postWrapper);
        }
        return userIds.length;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int resetPwd(Long userId, String password) {
        // 多租户隔离：验证租户ID
        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            LambdaQueryWrapper<SysUser> checkWrapper = new LambdaQueryWrapper<>();
            checkWrapper.eq(SysUser::getUserId, userId)
                       .eq(SysUser::getTenantId, tenantId);
            if (sysUserMapper.selectCount(checkWrapper) == 0) {
                throw new RuntimeException("无权重置此用户密码");
            }
        }
        
        SysUser user = new SysUser();
        user.setUserId(userId);
        user.setPassword(BCrypt.hashpw(password, BCrypt.gensalt()));
        return sysUserMapper.updateById(user);
    }

    @Override
    public String checkUserNameUnique(SysUser user) {
        // 多租户隔离：添加租户ID过滤
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysUser::getUserName, user.getUserName());
        
        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            wrapper.eq(SysUser::getTenantId, tenantId);
        }
        
        SysUser info = sysUserMapper.selectOne(wrapper);
        if (info != null && !info.getUserId().equals(user.getUserId())) {
            return "1"; // 不唯一
        }
        return "0"; // 唯一
    }

    @Override
    public String checkPhoneUnique(SysUser user) {
        // 多租户隔离：添加租户ID过滤
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysUser::getPhonenumber, user.getPhonenumber());
        
        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            wrapper.eq(SysUser::getTenantId, tenantId);
        }
        
        SysUser info = sysUserMapper.selectOne(wrapper);
        if (info != null && !info.getUserId().equals(user.getUserId())) {
            return "1"; // 不唯一
        }
        return "0"; // 唯一
    }

    @Override
    public String checkEmailUnique(SysUser user) {
        // 多租户隔离：添加租户ID过滤
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysUser::getEmail, user.getEmail());
        
        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            wrapper.eq(SysUser::getTenantId, tenantId);
        }
        
        SysUser info = sysUserMapper.selectOne(wrapper);
        if (info != null && !info.getUserId().equals(user.getUserId())) {
            return "1"; // 不唯一
        }
        return "0"; // 唯一
    }

    @Override
    public String selectUserRoleGroup(String userName) {
        return ""; // Simplified
    }
}
