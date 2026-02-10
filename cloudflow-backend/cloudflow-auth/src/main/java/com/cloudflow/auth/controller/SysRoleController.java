package com.cloudflow.auth.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
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
    public R<List<SysRole>> list(SysRole role) {
        return R.ok(roleService.selectRoleList(role));
    }
    
    @GetMapping("/{roleId}")
    public R<SysRole> getInfo(@PathVariable("roleId") Long roleId) {
        return R.ok(roleService.selectRoleById(roleId));
    }
    
    @PostMapping
    public R<?> add(@RequestBody SysRole role) {
        return R.ok(roleService.insertRole(role));
    }
    
    @PutMapping
    public R<?> edit(@RequestBody SysRole role) {
        return R.ok(roleService.updateRole(role));
    }
    
    @DeleteMapping("/{roleIds}")
    public R<?> remove(@PathVariable("roleIds") Long[] roleIds) {
        return R.ok(roleService.deleteRoleByIds(roleIds));
    }
}
