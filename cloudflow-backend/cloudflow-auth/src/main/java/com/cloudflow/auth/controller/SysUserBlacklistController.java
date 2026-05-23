package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.domain.SysUserBlacklist;
import com.cloudflow.auth.service.ISysUserBlacklistService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * GOV-P0-1 用户黑名单后台管理接口。
 */
@RestController
@RequestMapping("/system/userBlacklist")
@RequiredArgsConstructor
public class SysUserBlacklistController {

    private final ISysUserBlacklistService blacklistService;

    @GetMapping("/page")
    @SaCheckPermission("system:userBlacklist:list")
    public R<Page<SysUserBlacklist>> page(@RequestParam(required = false) String keyword,
                                          @RequestParam(required = false) String status,
                                          @RequestParam(defaultValue = "1") Integer pageNum,
                                          @RequestParam(defaultValue = "10") Integer pageSize) {
        return R.ok(blacklistService.page(keyword, status, pageNum, pageSize));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("system:userBlacklist:list")
    public R<SysUserBlacklist> detail(@PathVariable Long id) {
        return R.ok(blacklistService.getById(id));
    }

    @SysLog("拉黑用户")
    @PostMapping
    @SaCheckPermission("system:userBlacklist:add")
    public R<Void> ban(@RequestBody SysUserBlacklist rule) {
        try {
            return blacklistService.ban(rule) ? R.ok() : R.fail("拉黑失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改用户黑名单")
    @PutMapping
    @SaCheckPermission("system:userBlacklist:edit")
    public R<Void> edit(@RequestBody SysUserBlacklist rule) {
        try {
            return blacklistService.update(rule) ? R.ok() : R.fail("更新失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("解除拉黑")
    @PostMapping("/{id}/unban")
    @SaCheckPermission("system:userBlacklist:edit")
    public R<Void> unban(@PathVariable Long id) {
        return blacklistService.unban(id) ? R.ok() : R.fail("解除失败");
    }

    @SysLog("删除用户黑名单")
    @DeleteMapping("/{id}")
    @SaCheckPermission("system:userBlacklist:remove")
    public R<Void> remove(@PathVariable Long id) {
        return blacklistService.remove(id) ? R.ok() : R.fail("删除失败");
    }
}
