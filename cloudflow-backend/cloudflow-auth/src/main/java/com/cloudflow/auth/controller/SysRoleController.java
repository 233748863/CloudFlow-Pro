package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.domain.SysRole;
import com.cloudflow.auth.domain.dto.RoleOptionDTO;
import com.cloudflow.auth.service.ISysRoleService;
import com.cloudflow.common.core.domain.R;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/system/role")
@SaCheckLogin
public class SysRoleController {

    @Autowired
    private ISysRoleService roleService;

    @GetMapping("/list")
    @SaCheckPermission("system:role:list")
    public R<List<SysRole>> list(SysRole role) {
        return R.ok(roleService.selectRoleList(role));
    }

    @GetMapping("/optionselect")
    public R<List<RoleOptionDTO>> optionselect() {
        return R.ok(roleService.selectRoleOptions());
    }

    @GetMapping("/{roleId}")
    @SaCheckPermission("system:role:query")
    public R<SysRole> getInfo(@PathVariable("roleId") Long roleId) {
        return R.ok(roleService.selectRoleById(roleId));
    }

    @PostMapping
    @SaCheckPermission("system:role:add")
    public R<?> add(@RequestBody SysRole role) {
        return R.ok(roleService.insertRole(role));
    }

    @PutMapping
    @SaCheckPermission("system:role:edit")
    public R<?> edit(@RequestBody SysRole role) {
        return R.ok(roleService.updateRole(role));
    }

    @DeleteMapping("/{roleIds}")
    @SaCheckPermission("system:role:remove")
    public R<?> remove(@PathVariable("roleIds") Long[] roleIds) {
        return R.ok(roleService.deleteRoleByIds(roleIds));
    }
}
