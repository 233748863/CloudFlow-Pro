package com.cloudflow.auth.service.impl;

import cn.hutool.crypto.digest.BCrypt;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.SysRole;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.domain.SysUserRole;
import com.cloudflow.auth.mapper.SysRoleMapper;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.auth.mapper.SysUserRoleMapper;
import com.cloudflow.auth.service.ISysUserService;
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
    private SysUserMapper userMapper;

    @Autowired
    private SysUserRoleMapper userRoleMapper;

    @Autowired
    private SysRoleMapper roleMapper;

    @Override
    public List<SysUser> selectUserList(SysUser user) {
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(user.getUserName())) {
            wrapper.like(SysUser::getUserName, user.getUserName());
        }
        if (StringUtils.hasText(user.getPhonenumber())) {
            wrapper.like(SysUser::getPhonenumber, user.getPhonenumber());
        }
        if (StringUtils.hasText(user.getStatus())) {
            wrapper.eq(SysUser::getStatus, user.getStatus());
        }
        
        List<SysUser> list = userMapper.selectList(wrapper);
        // Fill roles for display if needed? 
        // For performance, usually we don't fetch roles for list.
        return list;
    }

    @Override
    public SysUser selectUserById(Long userId) {
        SysUser user = userMapper.selectById(userId);
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
    
    private List<SysRole> selectRolesByUserId(Long userId) {
        LambdaQueryWrapper<SysUserRole> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysUserRole::getUserId, userId);
        List<SysUserRole> urs = userRoleMapper.selectList(wrapper);
        if (urs.isEmpty()) return new ArrayList<>();
        
        List<Long> roleIds = urs.stream().map(SysUserRole::getRoleId).collect(Collectors.toList());
        return roleMapper.selectBatchIds(roleIds);
    }

    @Override
    @Transactional
    public int insertUser(SysUser user) {
        user.setCreateTime(new Date());
        if (StringUtils.hasText(user.getPassword())) {
            user.setPassword(BCrypt.hashpw(user.getPassword()));
        } else {
            // Default password
            user.setPassword(BCrypt.hashpw("123456"));
        }
        
        int rows = userMapper.insert(user);
        
        // Insert Roles
        insertUserRole(user);
        
        return rows;
    }

    @Override
    @Transactional
    public int updateUser(SysUser user) {
        if (StringUtils.hasText(user.getPassword())) {
            user.setPassword(BCrypt.hashpw(user.getPassword()));
        } else {
            // Don't update password if empty
            user.setPassword(null);
        }
        
        int rows = userMapper.updateById(user);
        
        // Update Roles (Delete and Insert)
        LambdaQueryWrapper<SysUserRole> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysUserRole::getUserId, user.getUserId());
        userRoleMapper.delete(wrapper);
        
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
                userRoleMapper.insert(ur);
            }
        }
    }

    @Override
    @Transactional
    public int deleteUserByIds(Long[] userIds) {
        for (Long userId : userIds) {
            userMapper.deleteById(userId);
            LambdaQueryWrapper<SysUserRole> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(SysUserRole::getUserId, userId);
            userRoleMapper.delete(wrapper);
        }
        return userIds.length;
    }

    @Override
    public String selectUserRoleGroup(String userName) {
        return ""; // Simplified
    }
}
