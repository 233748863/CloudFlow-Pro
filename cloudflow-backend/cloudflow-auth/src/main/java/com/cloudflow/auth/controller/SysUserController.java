package com.cloudflow.auth.controller;

import com.cloudflow.auth.annotation.HasPermission;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.service.ISysUserService;
import com.cloudflow.common.core.domain.R;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;
import java.util.List;
import java.util.Map;

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
        try {
            return R.ok(userService.insertUser(user));
        } catch (IllegalStateException ex) {
            return R.fail(ex.getMessage());
        }
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
     * 管理员重置用户密码
     */
    @PutMapping("/{userId}/password")
    @HasPermission("system:user:edit")
    public R<?> resetPassword(@PathVariable("userId") Long userId, @RequestBody Map<String, Object> params) {
        String password = params.get("password") == null ? "" : String.valueOf(params.get("password")).trim();
        if (!StringUtils.hasText(password)) {
            return R.fail("密码不能为空");
        }
        return R.ok(userService.resetPwd(userId, password));
    }

    /**
     * 删除用户
     */
    @DeleteMapping("/{userIds}")
    @HasPermission("system:user:remove")
    public R<?> remove(@PathVariable("userIds") Long[] userIds) {
        return R.ok(userService.deleteUserByIds(userIds));
    }

    /**
     * 批量查询用户信息
     * 
     * @param userIds 用户ID列表
     * @return 用户信息列表
     */
    @PostMapping("/batch")
    @HasPermission("system:user:query")
    public R<List<SysUser>> batchGetUsers(@RequestBody List<Long> userIds) {
        if (CollectionUtils.isEmpty(userIds)) {
            return R.ok(Collections.emptyList());
        }
        
        List<SysUser> users = userService.selectUserByIds(userIds);
        return R.ok(users);
    }
}
