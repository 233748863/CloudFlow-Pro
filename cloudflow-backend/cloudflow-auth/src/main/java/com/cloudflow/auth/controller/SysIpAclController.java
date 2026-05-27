package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.domain.SysIpAcl;
import com.cloudflow.auth.service.ISysIpAclService;
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

import java.util.List;

/**
 * GOV-P0-1 IP 黑白名单后台管理接口。
 */
@RestController
@RequestMapping("/system/ipAcl")
@RequiredArgsConstructor
public class SysIpAclController {

    private final ISysIpAclService sysIpAclService;

    @GetMapping("/page")
    @SaCheckPermission("system:ipAcl:list")
    public R<Page<SysIpAcl>> page(@RequestParam(required = false) String keyword,
                                  @RequestParam(required = false) String mode,
                                  @RequestParam(required = false) String status,
                                  @RequestParam(defaultValue = "1") Integer pageNum,
                                  @RequestParam(defaultValue = "10") Integer pageSize) {
        return R.ok(sysIpAclService.page(keyword, mode, status, pageNum, pageSize));
    }

    @GetMapping("/active")
    @SaCheckPermission("system:ipAcl:list")
    public R<List<SysIpAcl>> listActive() {
        return R.ok(sysIpAclService.listActive());
    }

    @GetMapping("/{id}")
    @SaCheckPermission("system:ipAcl:list")
    public R<SysIpAcl> detail(@PathVariable Long id) {
        return R.ok(sysIpAclService.getById(id));
    }

    @SysLog("新增IP黑白名单")
    @PostMapping
    @SaCheckPermission("system:ipAcl:add")
    public R<Void> add(@RequestBody SysIpAcl rule) {
        try {
            return sysIpAclService.save(rule) ? R.ok() : R.fail("新增失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改IP黑白名单")
    @PutMapping
    @SaCheckPermission("system:ipAcl:edit")
    public R<Void> edit(@RequestBody SysIpAcl rule) {
        try {
            return sysIpAclService.update(rule) ? R.ok() : R.fail("更新失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除IP黑白名单")
    @DeleteMapping("/{id}")
    @SaCheckPermission("system:ipAcl:remove")
    public R<Void> remove(@PathVariable Long id) {
        return sysIpAclService.remove(id) ? R.ok() : R.fail("删除失败");
    }

    @SysLog("启停IP黑白名单")
    @PostMapping("/{id}/status")
    @SaCheckPermission("system:ipAcl:edit")
    public R<Void> toggle(@PathVariable Long id, @RequestParam String status) {
        return sysIpAclService.toggleStatus(id, status) ? R.ok() : R.fail("操作失败");
    }

    @SysLog("手动重发IP黑白名单到网关")
    @PostMapping("/republish")
    @SaCheckPermission("system:ipAcl:edit")
    public R<Void> republish() {
        sysIpAclService.publishAllToGateway();
        return R.ok();
    }
}
