package com.cloudflow.auth.service;

import com.cloudflow.auth.domain.SysMenu;
import java.util.List;
import java.util.Set;

public interface ISysMenuService {
    List<SysMenu> selectMenuList(SysMenu menu, Long userId);
    List<SysMenu> selectMenuTreeByUserId(Long userId);
    SysMenu selectMenuById(Long menuId);
    Set<String> selectMenuPermsByUserId(Long userId);
    int insertMenu(SysMenu menu);
    int updateMenu(SysMenu menu);
    int deleteMenuById(Long menuId);

    /**
     * 根据角色ID查询菜单列表（带 Spring Cache 缓存）
     */
    List<SysMenu> findMenuByRoleId(Long roleId);

    /**
     * 根据角色ID查询权限标识（带 Spring Cache 缓存）
     */
    List<String> findPermsByRoleId(Long roleId);

    /**
     * 清除所有菜单缓存（菜单变更时调用）
     */
    void clearMenuCache();

    /**
     * 清除用户菜单树缓存
     */
    void evictUserMenuCache(Long userId);
}
