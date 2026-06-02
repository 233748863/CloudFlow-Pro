package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.domain.SysApiRatelimitRule;
import com.cloudflow.auth.service.ISysApiRatelimitRuleService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
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

import java.util.List;

/**
 * GOV-P1-1 API 动态限流规则后台管理接口。
 */
@RestController
@RequestMapping("/system/api-ratelimit")
@RequiredArgsConstructor
public class SysApiRatelimitRuleController {

    private final ISysApiRatelimitRuleService sysApiRatelimitRuleService;

    @GetMapping("/page")
    @SaCheckPermission("system:apiRateLimit:list")
    public R<Page<SysApiRatelimitRule>> page(@RequestParam(required = false) String keyword,
                                             @RequestParam(required = false) String status,
                                             @RequestParam(required = false) String dimension,
                                             @RequestParam(defaultValue = "1") Integer pageNum,
                                             @RequestParam(defaultValue = "10") Integer pageSize) {
        return R.ok(sysApiRatelimitRuleService.page(keyword, status, dimension, pageNum, pageSize));
    }

    @GetMapping("/active")
    @SaCheckPermission("system:apiRateLimit:list")
    public R<List<SysApiRatelimitRule>> listActive() {
        return R.ok(sysApiRatelimitRuleService.listActive());
    }

    @GetMapping("/{id}")
    @SaCheckPermission("system:apiRateLimit:list")
    public R<SysApiRatelimitRule> detail(@PathVariable Long id) {
        return R.ok(sysApiRatelimitRuleService.getById(id));
    }

    @SysLog("新增API限流规则")
    @PostMapping
    @RepeatSubmit
    @SaCheckPermission("system:apiRateLimit:add")
    public R<Void> add(@RequestBody SysApiRatelimitRule rule) {
        try {
            return sysApiRatelimitRuleService.save(rule) ? R.ok() : R.fail("新增失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改API限流规则")
    @PutMapping
    @RepeatSubmit
    @SaCheckPermission("system:apiRateLimit:edit")
    public R<Void> edit(@RequestBody SysApiRatelimitRule rule) {
        try {
            return sysApiRatelimitRuleService.update(rule) ? R.ok() : R.fail("更新失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除API限流规则")
    @DeleteMapping("/{id}")
    @SaCheckPermission("system:apiRateLimit:remove")
    public R<Void> remove(@PathVariable Long id) {
        return sysApiRatelimitRuleService.remove(id) ? R.ok() : R.fail("删除失败");
    }

    @SysLog("启停API限流规则")
    @PostMapping("/{id}/status")
    @RepeatSubmit
    @SaCheckPermission("system:apiRateLimit:edit")
    public R<Void> toggle(@PathVariable Long id, @RequestParam String status) {
        return sysApiRatelimitRuleService.toggleStatus(id, status) ? R.ok() : R.fail("操作失败");
    }

    @SysLog("手动重发API限流规则到网关")
    @PostMapping("/republish")
    @RepeatSubmit
    @SaCheckPermission("system:apiRateLimit:edit")
    public R<Void> republish() {
        sysApiRatelimitRuleService.publishAllToGateway();
        return R.ok();
    }
}
