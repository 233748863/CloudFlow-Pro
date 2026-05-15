package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.domain.SysMenu;
import com.cloudflow.auth.service.ISysMenuService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.utils.SecurityUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/system/menu")
public class SysMenuController {

    @Autowired
    private ISysMenuService menuService;

    /**
     * 获取菜单列表
     */
    @GetMapping("/list")
    @SaCheckPermission("system:menu:list")
    public R<List<SysMenu>> list(SysMenu menu) {
        Long userId = SecurityUtils.getUserId();
        List<SysMenu> menus = menuService.selectMenuList(menu, userId != null ? userId : 1L);
        return R.ok(menus);
    }

    /**
     * 获取菜单详情
     */
    @GetMapping("/{menuId}")
    @SaCheckPermission("system:menu:query")
    public R<SysMenu> getInfo(@PathVariable("menuId") Long menuId) {
        return R.ok(menuService.selectMenuById(menuId));
    }

    /**
     * 获取菜单树（用于角色分配）
     */
    @GetMapping("/treeselect")
    @SaCheckPermission("system:menu:list")
    public R<List<SysMenu>> treeselect(SysMenu menu) {
        Long userId = SecurityUtils.getUserId();
        List<SysMenu> menus = menuService.selectMenuList(menu, userId != null ? userId : 1L);
        return R.ok(menus);
    }

    /**
     * 新增菜单
     */
    @PostMapping
    @SaCheckPermission("system:menu:add")
    public R<?> add(@RequestBody SysMenu menu) {
        return R.ok(menuService.insertMenu(menu));
    }

    /**
     * 修改菜单
     */
    @PutMapping
    @SaCheckPermission("system:menu:edit")
    public R<?> edit(@RequestBody SysMenu menu) {
        return R.ok(menuService.updateMenu(menu));
    }

    /**
     * 删除菜单
     */
    @DeleteMapping("/{menuId}")
    @SaCheckPermission("system:menu:remove")
    public R<?> remove(@PathVariable("menuId") Long menuId) {
        return R.ok(menuService.deleteMenuById(menuId));
    }
}
