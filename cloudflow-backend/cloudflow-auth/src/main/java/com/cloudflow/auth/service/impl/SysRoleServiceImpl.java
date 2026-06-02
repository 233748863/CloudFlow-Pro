package com.cloudflow.auth.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.SysRole;
import com.cloudflow.auth.domain.SysRoleMenu;
import com.cloudflow.auth.domain.dto.RoleOptionDTO;
import com.cloudflow.auth.mapper.SysRoleMapper;
import com.cloudflow.auth.mapper.SysRoleMenuMapper;
import com.cloudflow.auth.service.ISysMenuService;
import com.cloudflow.auth.service.ISysRoleService;
import com.cloudflow.auth.service.ISysUserService;
import com.cloudflow.auth.service.UserSessionRevoker;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.constant.CacheConstants;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Map;
import java.util.Arrays;
import java.util.stream.Collectors;

/**
 * 角色服务实现
 * 角色变更时自动清除菜单缓存和用户菜单树缓存
 */
@Service
public class SysRoleServiceImpl implements ISysRoleService {

    @Autowired
    private SysRoleMapper roleMapper;

    @Autowired
    private SysRoleMenuMapper roleMenuMapper;

    @Autowired
    private ISysMenuService sysMenuService;

    @Autowired
    private ISysUserService sysUserService;

    @Autowired
    private UserSessionRevoker userSessionRevoker;

    @Override
    public List<SysRole> selectRoleList(SysRole role) {
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
        List<SysRole> roles = roleMapper.selectList(wrapper);
        fillRoleMenuIds(roles);
        return roles;
    }

    @Override
    public List<RoleOptionDTO> selectRoleOptions() {
        LambdaQueryWrapper<SysRole> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysRole::getStatus, "0")
                .eq(SysRole::getDeleted, "0")
                .orderByAsc(SysRole::getRoleSort)
                .orderByAsc(SysRole::getRoleId);
        return roleMapper.selectList(wrapper).stream()
                .map(role -> new RoleOptionDTO(role.getRoleId(), role.getRoleName(), role.getRoleKey()))
                .collect(Collectors.toList());
    }

    @Override
    public SysRole selectRoleById(Long roleId) {
        SysRole role = roleMapper.selectById(roleId);
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
    @CacheEvict(value = {CacheConstants.MENU_DETAILS, CacheConstants.USER_MENUS, CacheConstants.USER_DETAILS}, allEntries = true)
    public int insertRole(SysRole role) {
        int rows = roleMapper.insert(role);
        insertRoleMenu(role);
        // 注意：@CacheEvict 会自动清除缓存，不需要手动调用 clearMenuCache()
        return rows;
    }

    @Override
    @Transactional
    @CacheEvict(value = {CacheConstants.MENU_DETAILS, CacheConstants.USER_MENUS, CacheConstants.USER_DETAILS}, allEntries = true)
    public int updateRole(SysRole role) {
        int rows = roleMapper.updateById(role);
        // 清除旧的角色-菜单关联
        LambdaQueryWrapper<SysRoleMenu> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysRoleMenu::getRoleId, role.getRoleId());
        roleMenuMapper.delete(wrapper);
        // 插入新的角色-菜单关联
        insertRoleMenu(role);
        revokeSessionsByRole(role.getRoleId());
        // 注意：@CacheEvict 会自动清除缓存，不需要手动调用 clearMenuCache()
        return rows;
    }

    public void insertRoleMenu(SysRole role) {
        Long[] menuIds = role.getMenuIds();
        if (menuIds != null && menuIds.length > 0) {
            for (Long menuId : menuIds) {
                SysRoleMenu rm = new SysRoleMenu();
                rm.setRoleId(role.getRoleId());
                rm.setMenuId(menuId);
                rm.setTenantId(role.getTenantId());
                roleMenuMapper.insert(rm);
            }
        }
    }

    private void fillRoleMenuIds(List<SysRole> roles) {
        if (roles == null || roles.isEmpty()) {
            return;
        }

        List<Long> roleIds = roles.stream()
                .map(SysRole::getRoleId)
                .filter(id -> id != null)
                .collect(Collectors.toList());
        if (roleIds.isEmpty()) {
            return;
        }

        LambdaQueryWrapper<SysRoleMenu> wrapper = new LambdaQueryWrapper<>();
        wrapper.in(SysRoleMenu::getRoleId, roleIds);
        Map<Long, List<Long>> menuIdsByRole = roleMenuMapper.selectList(wrapper).stream()
                .collect(Collectors.groupingBy(
                        SysRoleMenu::getRoleId,
                        Collectors.mapping(SysRoleMenu::getMenuId, Collectors.toList())
                ));

        roles.forEach(role -> {
            List<Long> menuIds = menuIdsByRole.getOrDefault(role.getRoleId(), List.of());
            role.setMenuIds(menuIds.toArray(Long[]::new));
        });
    }

    @Override
    @Transactional
    @CacheEvict(value = {CacheConstants.MENU_DETAILS, CacheConstants.USER_MENUS, CacheConstants.USER_DETAILS}, allEntries = true)
    @Audit(name = "删除角色", highRisk = true)
    public int deleteRoleByIds(Long[] roleIds) {
        for (Long roleId : roleIds) {
            revokeSessionsByRole(roleId);
            roleMapper.deleteById(roleId);
            LambdaQueryWrapper<SysRoleMenu> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(SysRoleMenu::getRoleId, roleId);
            roleMenuMapper.delete(wrapper);
        }
        // 注意：@CacheEvict 会自动清除缓存，不需要手动调用 clearMenuCache()
        return roleIds.length;
    }

    private void revokeSessionsByRole(Long roleId) {
        if (roleId == null) {
            return;
        }
        sysUserService.selectUserList(new com.cloudflow.auth.domain.SysUser()).stream()
                .filter(user -> user.getRoleIds() != null)
                .filter(user -> Arrays.stream(user.getRoleIds()).anyMatch(roleId::equals))
                .map(com.cloudflow.auth.domain.SysUser::getUserId)
                .distinct()
                .forEach(userSessionRevoker::revokeByUserId);
    }
}
