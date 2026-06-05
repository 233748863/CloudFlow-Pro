package com.cloudflow.auth.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.SysMenu;
import com.cloudflow.auth.mapper.SysMenuMapper;
import com.cloudflow.auth.service.ISysMenuService;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.annotation.HighRiskAction;
import com.cloudflow.common.core.constant.CacheConstants;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.common.redis.lock.DistributedLock;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 菜单服务实现
 * 参考 Poco 的缓存架构：
 * - findMenuByRoleId: 按 roleId 缓存菜单列表（@Cacheable）
 * - findPermsByRoleId: 按 roleId 缓存权限标识（@Cacheable）
 * - 菜单增删改时自动清除缓存（@CacheEvict allEntries）
 */
@Service
public class SysMenuServiceImpl implements ISysMenuService {

    @Autowired
    private SysMenuMapper menuMapper;

    // ==================== 带缓存的核心方法（参考 Poco） ====================

    @Override
    @DistributedLock(key = "'cache:menu:role:' + #roleId", waitMs = 500, leaseMs = 10000)
    @Cacheable(value = CacheConstants.MENU_DETAILS, key = "#roleId", unless = "#result.isEmpty()")
    public List<SysMenu> findMenuByRoleId(Long roleId) {
        return menuMapper.selectMenusByRoleId(roleId);
    }

    @Override
    @DistributedLock(key = "'cache:menu:perms:' + #roleId", waitMs = 500, leaseMs = 10000)
    @Cacheable(value = CacheConstants.MENU_DETAILS, key = "'perms:' + #roleId", unless = "#result.isEmpty()")
    public List<String> findPermsByRoleId(Long roleId) {
        return menuMapper.selectMenuPermsByRoleId(roleId);
    }

    @Override
    @CacheEvict(value = CacheConstants.MENU_DETAILS, allEntries = true)
    public void clearMenuCache() {
        // 仅清除缓存，方法体为空
    }

    @Override
    @CacheEvict(value = CacheConstants.USER_MENUS, key = "#userId")
    public void evictUserMenuCache(Long userId) {
        // 仅清除指定用户的菜单树缓存
    }

    // ==================== 原有方法 ====================

    @Override
    public List<SysMenu> selectMenuList(SysMenu menu, Long userId) {
        LambdaQueryWrapper<SysMenu> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(menu.getMenuName())) {
            wrapper.like(SysMenu::getMenuName, menu.getMenuName());
        }
        if (StringUtils.hasText(menu.getStatus())) {
            wrapper.eq(SysMenu::getStatus, menu.getStatus());
        }
        wrapper.orderByAsc(SysMenu::getParentId, SysMenu::getOrderNum);
        return menuMapper.selectList(wrapper);
    }

    @Override
    @DistributedLock(key = "'cache:user:menus:' + #userId", waitMs = 500, leaseMs = 10000)
    @Cacheable(value = CacheConstants.USER_MENUS, key = "#userId", unless = "#result.isEmpty()")
    public List<SysMenu> selectMenuTreeByUserId(Long userId) {
        if (SecurityUtils.isAdmin(userId)) {
            LambdaQueryWrapper<SysMenu> wrapper = new LambdaQueryWrapper<>();
            wrapper.in(SysMenu::getMenuType, "M", "C");
            wrapper.eq(SysMenu::getStatus, "0");
            wrapper.orderByAsc(SysMenu::getParentId, SysMenu::getOrderNum);
            return getChildPerms(menuMapper.selectList(wrapper), 0);
        }
        return getChildPerms(menuMapper.selectMenuTreeByUserId(userId), 0);
    }

    @Override
    public Set<String> selectMenuPermsByUserId(Long userId) {
        List<String> perms = menuMapper.selectMenuPermsByUserId(userId);
        Set<String> permsSet = new HashSet<>();
        for (String perm : perms) {
            if (StringUtils.hasText(perm)) {
                permsSet.addAll(Set.of(perm.trim().split(",")));
            }
        }
        return permsSet;
    }

    @Override
    public SysMenu selectMenuById(Long menuId) {
        return menuMapper.selectById(menuId);
    }

    @Override
    @CacheEvict(value = {CacheConstants.MENU_DETAILS, CacheConstants.USER_MENUS}, allEntries = true)
    public int insertMenu(SysMenu menu) {
        return menuMapper.insert(menu);
    }

    @Override
    @HighRiskAction
    @Audit(name = "更新菜单", spel = "#menu", oldVal = "@sysMenuServiceImpl.selectMenuById(#menu.menuId)", diff = true, highRisk = true)
    @CacheEvict(value = {CacheConstants.MENU_DETAILS, CacheConstants.USER_MENUS}, allEntries = true)
    public int updateMenu(SysMenu menu) {
        return menuMapper.updateById(menu);
    }

    @Override
    @HighRiskAction
    @Audit(name = "删除菜单", highRisk = true)
    @CacheEvict(value = {CacheConstants.MENU_DETAILS, CacheConstants.USER_MENUS}, allEntries = true)
    public int deleteMenuById(Long menuId) {
        LambdaQueryWrapper<SysMenu> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysMenu::getParentId, menuId);
        if (menuMapper.selectCount(wrapper) > 0) {
            throw new RuntimeException("存在子菜单,不允许删除");
        }
        return menuMapper.deleteById(menuId);
    }

    // ==================== 树构建工具方法 ====================

    public List<SysMenu> getChildPerms(List<SysMenu> list, int parentId) {
        List<SysMenu> returnList = new ArrayList<>();
        for (SysMenu t : list) {
            if (t.getParentId() == parentId) {
                recursionFn(list, t);
                returnList.add(t);
            }
        }
        return returnList;
    }

    private void recursionFn(List<SysMenu> list, SysMenu t) {
        List<SysMenu> childList = getChildList(list, t);
        t.setChildren(childList);
        for (SysMenu tChild : childList) {
            if (hasChild(list, tChild)) {
                recursionFn(list, tChild);
            }
        }
    }

    private List<SysMenu> getChildList(List<SysMenu> list, SysMenu t) {
        List<SysMenu> tlist = new ArrayList<>();
        for (SysMenu n : list) {
            if (n.getParentId().longValue() == t.getMenuId().longValue()) {
                tlist.add(n);
            }
        }
        return tlist;
    }

    private boolean hasChild(List<SysMenu> list, SysMenu t) {
        return !getChildList(list, t).isEmpty();
    }
}
