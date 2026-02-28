package com.cloudflow.auth.service.impl;

import cn.hutool.crypto.digest.BCrypt;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.SysDept;
import com.cloudflow.auth.domain.SysRole;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.domain.SysUserRole;
import com.cloudflow.auth.domain.SysUserPost;
import com.cloudflow.auth.domain.dto.UserInfo;
import com.cloudflow.auth.mapper.SysDeptMapper;
import com.cloudflow.auth.mapper.SysRoleMapper;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.auth.mapper.SysUserPostMapper;
import com.cloudflow.auth.mapper.SysUserRoleMapper;
import com.cloudflow.auth.service.ISysMenuService;
import com.cloudflow.auth.service.ISysUserService;
import com.cloudflow.common.core.constant.CacheConstants;
import com.cloudflow.common.core.context.UserContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.time.LocalDateTime;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 用户服务实现
 * 参考 Poco 的缓存架构：
 * - findUserInfo: 按 username 缓存用户信息（含角色+权限）
 * - 用户增删改时自动清除缓存（@CacheEvict）
 */
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

    @Autowired
    private ISysMenuService menuService;

    // ==================== 带缓存的核心方法（参考 Poco） ====================

    @Override
    @Cacheable(value = CacheConstants.USER_DETAILS, key = "#username", unless = "#result == null")
    public UserInfo findUserInfo(String username) {
        // 查询用户
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysUser::getUserName, username);
        SysUser user = sysUserMapper.selectOne(wrapper);
        if (user == null) {
            return null;
        }

        // 查询角色
        List<SysRole> roles = selectRolesByUserId(user.getUserId());
        Set<String> roleKeys = new HashSet<>();
        List<Long> roleIds = new ArrayList<>();
        for (SysRole role : roles) {
            roleKeys.add(role.getRoleKey());
            roleIds.add(role.getRoleId());
        }

        // 通过角色查询权限（利用菜单缓存）
        Set<String> permissions = new HashSet<>();
        for (Long roleId : roleIds) {
            List<String> permList = menuService.findPermsByRoleId(roleId);
            for (String perm : permList) {
                if (StringUtils.hasText(perm)) {
                    for (String p : perm.trim().split(",")) {
                        if (StringUtils.hasText(p)) {
                            permissions.add(p.trim());
                        }
                    }
                }
            }
        }

        // 管理员拥有所有权限
        if (user.getUserId() != null && user.getUserId() == 1L) {
            permissions.add("*:*:*");
        }

        return new UserInfo(user, roleKeys, permissions);
    }

    @Override
    @CacheEvict(value = CacheConstants.USER_DETAILS, key = "#username")
    public void evictUserInfoCache(String username) {
        // 仅清除缓存,方法体为空
    }

    // ==================== 原有方法（增加缓存失效） ====================

    @Override
    public List<SysUser> selectUserList(SysUser user) {
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

        for (SysUser u : users) {
            List<SysRole> roles = selectRolesByUserId(u.getUserId());
            if (!roles.isEmpty()) {
                u.setRole(roles.get(0).getRoleName());
                u.setRoleIds(roles.stream().map(SysRole::getRoleId).toArray(Long[]::new));
            }
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
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysUser::getUserId, userId);

        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            wrapper.eq(SysUser::getTenantId, tenantId);
        }

        SysUser user = sysUserMapper.selectOne(wrapper);
        if (user != null) {
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
        user.setCreateTime(LocalDateTime.now());

        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            user.setTenantId(tenantId);
        }

        if (StringUtils.hasText(user.getPassword())) {
            user.setPassword(BCrypt.hashpw(user.getPassword(), BCrypt.gensalt()));
        } else {
            String defaultPwdSha256 = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";
            user.setPassword(BCrypt.hashpw(defaultPwdSha256, BCrypt.gensalt()));
        }

        int result = sysUserMapper.insert(user);

        if (result > 0) {
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

            insertUserRole(user);
        }

        return result;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = CacheConstants.USER_DETAILS, key = "#user.userName")
    public int updateUser(SysUser user) {
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
            user.setPassword(BCrypt.hashpw(user.getPassword(), BCrypt.gensalt()));
        } else {
            user.setPassword(null);
        }

        int rows = sysUserMapper.updateById(user);

        LambdaQueryWrapper<SysUserRole> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysUserRole::getUserId, user.getUserId());
        sysUserRoleMapper.delete(wrapper);

        insertUserRole(user);

        // 同时清除用户菜单树缓存
        menuService.evictUserMenuCache(user.getUserId());

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
        Long tenantId = UserContext.getTenantId();

        for (Long userId : userIds) {
            // 先查出用户名用于清除缓存
            SysUser existingUser = sysUserMapper.selectById(userId);
            if (existingUser != null) {
                evictUserInfoCache(existingUser.getUserName());
                menuService.evictUserMenuCache(userId);
            }

            LambdaQueryWrapper<SysUser> userWrapper = new LambdaQueryWrapper<>();
            userWrapper.eq(SysUser::getUserId, userId);
            if (tenantId != null) {
                userWrapper.eq(SysUser::getTenantId, tenantId);
            }
            sysUserMapper.delete(userWrapper);

            LambdaQueryWrapper<SysUserRole> roleWrapper = new LambdaQueryWrapper<>();
            roleWrapper.eq(SysUserRole::getUserId, userId);
            sysUserRoleMapper.delete(roleWrapper);

            LambdaQueryWrapper<SysUserPost> postWrapper = new LambdaQueryWrapper<>();
            postWrapper.eq(SysUserPost::getUserId, userId);
            sysUserPostMapper.delete(postWrapper);
        }
        return userIds.length;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int resetPwd(Long userId, String password) {
        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            LambdaQueryWrapper<SysUser> checkWrapper = new LambdaQueryWrapper<>();
            checkWrapper.eq(SysUser::getUserId, userId)
                       .eq(SysUser::getTenantId, tenantId);
            if (sysUserMapper.selectCount(checkWrapper) == 0) {
                throw new RuntimeException("无权重置此用户密码");
            }
        }

        // 清除用户缓存
        SysUser existingUser = sysUserMapper.selectById(userId);
        if (existingUser != null) {
            evictUserInfoCache(existingUser.getUserName());
        }

        SysUser user = new SysUser();
        user.setUserId(userId);
        user.setPassword(BCrypt.hashpw(password, BCrypt.gensalt()));
        return sysUserMapper.updateById(user);
    }

    @Override
    public String checkUserNameUnique(SysUser user) {
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysUser::getUserName, user.getUserName());

        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            wrapper.eq(SysUser::getTenantId, tenantId);
        }

        SysUser info = sysUserMapper.selectOne(wrapper);
        if (info != null && !info.getUserId().equals(user.getUserId())) {
            return "1";
        }
        return "0";
    }

    @Override
    public String checkPhoneUnique(SysUser user) {
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysUser::getPhonenumber, user.getPhonenumber());

        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            wrapper.eq(SysUser::getTenantId, tenantId);
        }

        SysUser info = sysUserMapper.selectOne(wrapper);
        if (info != null && !info.getUserId().equals(user.getUserId())) {
            return "1";
        }
        return "0";
    }

    @Override
    public String checkEmailUnique(SysUser user) {
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysUser::getEmail, user.getEmail());

        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            wrapper.eq(SysUser::getTenantId, tenantId);
        }

        SysUser info = sysUserMapper.selectOne(wrapper);
        if (info != null && !info.getUserId().equals(user.getUserId())) {
            return "1";
        }
        return "0";
    }

    @Override
    public String selectUserRoleGroup(String userName) {
        return "";
    }

    @Override
    public List<SysUser> selectUserByIds(List<Long> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return new ArrayList<>();
        }
        
        return sysUserMapper.selectBatchIds(userIds);
    }
}
