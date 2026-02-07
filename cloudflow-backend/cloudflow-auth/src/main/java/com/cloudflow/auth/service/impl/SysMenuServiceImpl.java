package com.cloudflow.auth.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.SysMenu;
import com.cloudflow.auth.mapper.SysMenuMapper;
import com.cloudflow.auth.service.ISysMenuService;
import com.cloudflow.common.core.utils.SecurityUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class SysMenuServiceImpl implements ISysMenuService {

    @Autowired
    private SysMenuMapper menuMapper;

    @Override
    public List<SysMenu> selectMenuList(SysMenu menu, Long userId) {
        // For Admin, show all. For others, show based on role?
        // Simplified: Admin shows all.
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
    public List<SysMenu> selectMenuTreeByUserId(Long userId) {
        // If admin, select all M/C
        // Simplified logic: select all for now or perms
        // Let's implement full role check later.
        // But for admin (id=1), select all.
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
    public int insertMenu(SysMenu menu) {
        return menuMapper.insert(menu);
    }

    @Override
    public int updateMenu(SysMenu menu) {
        return menuMapper.updateById(menu);
    }

    @Override
    public int deleteMenuById(Long menuId) {
        // Check if has children
        LambdaQueryWrapper<SysMenu> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysMenu::getParentId, menuId);
        if (menuMapper.selectCount(wrapper) > 0) {
            throw new RuntimeException("存在子菜单,不允许删除");
        }
        return menuMapper.deleteById(menuId);
    }
    
    /**
     * Build Tree
     */
    public List<SysMenu> getChildPerms(List<SysMenu> list, int parentId) {
        List<SysMenu> returnList = new ArrayList<>();
        for (SysMenu t : list) {
            // One level
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
        return getChildList(list, t).size() > 0;
    }
}
