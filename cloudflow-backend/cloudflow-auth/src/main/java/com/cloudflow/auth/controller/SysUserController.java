package com.cloudflow.auth.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.service.ISysUserService;
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
    public R<List<SysUser>> list(SysUser user) {
        List<SysUser> list = userService.selectUserList(user);
        return R.ok(list);
    }
    
    /**
     * 获取用户详情
     */
    @GetMapping("/{userId}")
    public R<SysUser> getInfo(@PathVariable("userId") Long userId) {
        return R.ok(userService.selectUserById(userId));
    }
    
    /**
     * 新增用户
     */
    @PostMapping
    public R<?> add(@RequestBody SysUser user) {
        return R.ok(userService.insertUser(user));
    }
    
    /**
     * 修改用户
     */
    @PutMapping
    public R<?> edit(@RequestBody SysUser user) {
        return R.ok(userService.updateUser(user));
    }
    
    /**
     * 删除用户
     */
    @DeleteMapping("/{userIds}")
    public R<?> remove(@PathVariable Long[] userIds) {
        return R.ok(userService.deleteUserByIds(userIds));
    }
}
