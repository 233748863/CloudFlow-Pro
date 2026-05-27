package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.domain.dto.ResetPasswordDTO;
import com.cloudflow.auth.service.ISysUserService;
import com.cloudflow.common.core.domain.R;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;
import java.util.List;

@RestController
@RequestMapping("/system/user")
public class SysUserController {

    @Autowired
    private ISysUserService sysUserService;

    /**
     * 获取用户列表
     */
    @GetMapping("/list")
    @SaCheckPermission("system:user:list")
    public R<List<SysUser>> list(SysUser user) {
        List<SysUser> list = sysUserService.selectUserList(user);
        return R.ok(list);
    }

    /**
     * 获取用户详情
     */
    @GetMapping("/{userId}")
    @SaCheckPermission("system:user:query")
    public R<SysUser> getInfo(@PathVariable("userId") Long userId) {
        return R.ok(sysUserService.selectUserById(userId));
    }

    /**
     * 新增用户
     */
    @PostMapping
    @SaCheckPermission("system:user:add")
    public R<?> add(@RequestBody SysUser user) {
        try {
            user.setPwdResetRequired("1");
            return R.ok(sysUserService.insertUser(user));
        } catch (IllegalStateException ex) {
            return R.fail(ex.getMessage());
        }
    }

    /**
     * 修改用户
     */
    @PutMapping
    @SaCheckPermission("system:user:edit")
    public R<?> edit(@RequestBody SysUser user) {
        return R.ok(sysUserService.updateUser(user));
    }

    /**
     * 管理员重置用户密码
     */
    @PutMapping("/{userId}/password")
    @SaCheckPermission("system:user:edit")
    public R<?> resetPassword(@PathVariable("userId") Long userId, @RequestBody ResetPasswordDTO dto) {
        String password = dto.getPassword() == null ? "" : dto.getPassword().trim();
        if (!StringUtils.hasText(password)) {
            return R.fail("密码不能为空");
        }
        return R.ok(sysUserService.resetPwd(userId, password));
    }

    /**
     * 删除用户
     */
    @DeleteMapping("/{userIds}")
    @SaCheckPermission("system:user:remove")
    public R<?> remove(@PathVariable("userIds") Long[] userIds) {
        return R.ok(sysUserService.deleteUserByIds(userIds));
    }

    /**
     * 批量查询用户信息
     *
     * @param userIds 用户ID列表
     * @return 用户信息列表
     */
    @PostMapping("/batch")
    @SaCheckPermission("system:user:query")
    public R<List<SysUser>> batchGetUsers(@RequestBody List<Long> userIds) {
        if (CollectionUtils.isEmpty(userIds)) {
            return R.ok(Collections.emptyList());
        }

        List<SysUser> users = sysUserService.selectUserByIds(userIds);
        return R.ok(users);
    }
}
