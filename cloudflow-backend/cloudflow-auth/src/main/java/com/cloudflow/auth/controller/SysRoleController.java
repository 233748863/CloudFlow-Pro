package com.cloudflow.auth.controller;

import com.cloudflow.auth.annotation.HasPermission;
import com.cloudflow.auth.domain.SysRole;
import com.cloudflow.auth.service.ISysRoleService;
import com.cloudflow.common.core.domain.R;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/system/role")
public class SysRoleController {

    @Autowired
    private ISysRoleService roleService;

    @GetMapping("/list")
    @HasPermission("system:role:list")
    public R<List<SysRole>> list(SysRole role) {
        return R.ok(roleService.selectRoleList(role));
    }

    @GetMapping("/{roleId}")
    @HasPermission("system:role:query")
    public R<SysRole> getInfo(@PathVariable("roleId") Long roleId) {
        return R.ok(roleService.selectRoleById(roleId));
    }

    @PostMapping
    @HasPermission("system:role:add")
    public R<?> add(@RequestBody SysRole role) {
        return R.ok(roleService.insertRole(role));
    }

    @PutMapping
    @HasPermission("system:role:edit")
    public R<?> edit(@RequestBody SysRole role) {
        return R.ok(roleService.updateRole(role));
    }

    @DeleteMapping("/{roleIds}")
    @HasPermission("system:role:remove")
    public R<?> remove(@PathVariable("roleIds") Long[] roleIds) {
        return R.ok(roleService.deleteRoleByIds(roleIds));
    }
}
