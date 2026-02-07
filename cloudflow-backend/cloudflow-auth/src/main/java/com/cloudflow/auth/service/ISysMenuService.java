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
}
