package com.cloudflow.auth.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.SysRole;
import com.cloudflow.auth.domain.SysRoleMenu;
import com.cloudflow.auth.mapper.SysRoleMapper;
import com.cloudflow.auth.mapper.SysRoleMenuMapper;
import com.cloudflow.auth.service.ISysRoleService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;

@Service
public class SysRoleServiceImpl implements ISysRoleService {

    @Autowired
    private SysRoleMapper roleMapper;
    
    @Autowired
    private SysRoleMenuMapper roleMenuMapper;

    @Override
    public List<SysRole> selectRoleList(SysRole role) {
        // ... (existing code)
        LambdaQueryWrapper<SysRole> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(role.getRoleName())) {
            wrapper.like(SysRole::getRoleName, role.getRoleName());
        }
        if (StringUtils.hasText(role.getRoleKey())) {
            wrapper.like(SysRole::getRoleKey, role.getRoleKey());
        }
        if (StringUtils.hasText(role.getStatus())) {
            wrapper.eq(SysRole::getStatus, role.getStatus());
        }
        wrapper.orderByAsc(SysRole::getRoleSort);
        return roleMapper.selectList(wrapper);
    }

    @Override
    public SysRole selectRoleById(Long roleId) {
        SysRole role = roleMapper.selectById(roleId);
        // Load menu IDs
        if (role != null) {
            LambdaQueryWrapper<SysRoleMenu> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(SysRoleMenu::getRoleId, roleId);
            List<SysRoleMenu> rms = roleMenuMapper.selectList(wrapper);
            role.setMenuIds(rms.stream().map(SysRoleMenu::getMenuId).toArray(Long[]::new));
        }
        return role;
    }

    @Override
    @Transactional
    public int insertRole(SysRole role) {
        int rows = roleMapper.insert(role);
        insertRoleMenu(role);
        return rows;
    }

    @Override
    @Transactional
    public int updateRole(SysRole role) {
        int rows = roleMapper.updateById(role);
        // clear old menus
        LambdaQueryWrapper<SysRoleMenu> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysRoleMenu::getRoleId, role.getRoleId());
        roleMenuMapper.delete(wrapper);
        insertRoleMenu(role);
        return rows;
    }
    
    public void insertRoleMenu(SysRole role) {
        Long[] menuIds = role.getMenuIds();
        if (menuIds != null && menuIds.length > 0) {
            for (Long menuId : menuIds) {
                SysRoleMenu rm = new SysRoleMenu();
                rm.setRoleId(role.getRoleId());
                rm.setMenuId(menuId);
                roleMenuMapper.insert(rm);
            }
        }
    }

    @Override
    @Transactional
    public int deleteRoleByIds(Long[] roleIds) {
        for (Long roleId : roleIds) {
            roleMapper.deleteById(roleId);
            LambdaQueryWrapper<SysRoleMenu> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(SysRoleMenu::getRoleId, roleId);
            roleMenuMapper.delete(wrapper);
        }
        return roleIds.length;
    }
}
