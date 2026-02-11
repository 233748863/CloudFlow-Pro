package com.cloudflow.auth.controller;

import com.cloudflow.auth.annotation.HasPermission;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.service.ISysUserService;
import com.cloudflow.common.core.domain.R;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/system/user")
public class SysUserController {

    @Autowired
    private ISysUserService userService;

    /**
     * 获取用户列表
     */
    @GetMapping("/list")
    @HasPermission("system:user:list")
    public R<List<SysUser>> list(SysUser user) {
        List<SysUser> list = userService.selectUserList(user);
        return R.ok(list);
    }

    /**
     * 获取用户详情
     */
    @GetMapping("/{userId}")
    @HasPermission("system:user:query")
    public R<SysUser> getInfo(@PathVariable("userId") Long userId) {
        return R.ok(userService.selectUserById(userId));
    }

    /**
     * 新增用户
     */
    @PostMapping
    @HasPermission("system:user:add")
    public R<?> add(@RequestBody SysUser user) {
        return R.ok(userService.insertUser(user));
    }

    /**
     * 修改用户
     */
    @PutMapping
    @HasPermission("system:user:edit")
    public R<?> edit(@RequestBody SysUser user) {
        return R.ok(userService.updateUser(user));
    }

    /**
     * 删除用户
     */
    @DeleteMapping("/{userIds}")
    @HasPermission("system:user:remove")
    public R<?> remove(@PathVariable("userIds") Long[] userIds) {
        return R.ok(userService.deleteUserByIds(userIds));
    }
}
