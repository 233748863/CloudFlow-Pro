package com.cloudflow.auth.controller;

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
    public R<List<SysMenu>> list(SysMenu menu) {
        // userId 1 is admin
        Long userId = 1L; // Mock or get from context
        List<SysMenu> menus = menuService.selectMenuList(menu, userId);
        return R.ok(menus);
    }

    /**
     * 获取菜单详情
     */
    @GetMapping("/{menuId}")
    public R<SysMenu> getInfo(@PathVariable("menuId") Long menuId) {
        return R.ok(menuService.selectMenuById(menuId));
    }
    
    /**
     * 获取菜单树（用于角色分配）
     * 返回结构：{ "menus": [Tree], "checkedKeys": [] } or just list
     * 前端通常需要扁平列表或者树形
     */
    @GetMapping("/treeselect")
    public R<List<SysMenu>> treeselect(SysMenu menu) {
        Long userId = 1L; 
        List<SysMenu> menus = menuService.selectMenuList(menu, userId);
        // Frontend might construct tree
        return R.ok(menus);
    }

    /**
     * 新增菜单
     */
    @PostMapping
    public R<?> add(@RequestBody SysMenu menu) {
        return R.ok(menuService.insertMenu(menu));
    }

    /**
     * 修改菜单
     */
    @PutMapping
    public R<?> edit(@RequestBody SysMenu menu) {
        return R.ok(menuService.updateMenu(menu));
    }

    /**
     * 删除菜单
     */
    @DeleteMapping("/{menuId}")
    public R<?> remove(@PathVariable("menuId") Long menuId) {
        return R.ok(menuService.deleteMenuById(menuId));
    }
}
