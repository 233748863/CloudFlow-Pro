package com.cloudflow.auth.controller.system;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.domain.SysFileConfig;
import com.cloudflow.auth.service.SysFileConfigService;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
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
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/system/file/config")
@RequiredArgsConstructor
public class SysFileConfigController {
    private final SysFileConfigService service;

    @GetMapping("/list")
    @SaCheckPermission("system:file:config:list")
    public R<PageResult<SysFileConfig>> list(PageQuery query) {
        return R.ok(service.page(query));
    }

    @GetMapping("/{configId}")
    @SaCheckPermission("system:file:config:list")
    public R<SysFileConfig> detail(@PathVariable Long configId) {
        return R.ok(service.detail(configId));
    }

    @PostMapping
    @SysLog(value = "新增文件存储配置", logParams = false)
    @RepeatSubmit
    @SaCheckPermission("system:file:config:add")
    public R<SysFileConfig> create(@RequestBody SysFileConfig request) {
        return R.ok(service.save(request, true));
    }

    @PutMapping
    @SysLog(value = "修改文件存储配置", logParams = false)
    @RepeatSubmit
    @SaCheckPermission("system:file:config:edit")
    public R<SysFileConfig> update(@RequestBody SysFileConfig request) {
        return R.ok(service.save(request, false));
    }

    @DeleteMapping("/{configId}")
    @SysLog(value = "删除文件存储配置", logParams = false)
    @RepeatSubmit
    @SaCheckPermission("system:file:config:remove")
    public R<Void> remove(@PathVariable Long configId) {
        service.remove(configId);
        return R.ok();
    }

    @PostMapping("/{configId}/test")
    @RepeatSubmit
    @SaCheckPermission("system:file:config:edit")
    public R<Void> testConnection(@PathVariable Long configId) {
        service.storage(service.require(configId)).testConnection();
        return R.ok();
    }
}
