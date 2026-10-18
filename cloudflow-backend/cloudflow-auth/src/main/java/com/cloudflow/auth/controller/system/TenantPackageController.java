package com.cloudflow.auth.controller.system;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.tenantpackage.TenantPackageManagementService;
import com.cloudflow.auth.tenantpackage.TenantPackageSaveRequest;
import com.cloudflow.auth.tenantpackage.TenantPackageSyncRequests;
import com.cloudflow.auth.tenantpackage.TenantPackageSyncService;
import com.cloudflow.auth.tenantpackage.TenantPackageViews;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.ratelimiter.annotation.RateLimiter;
import com.cloudflow.common.ratelimiter.enums.LimitType;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/system/tenant-package")
@RequiredArgsConstructor
public class TenantPackageController {
    private final TenantPackageManagementService service;
    private final TenantPackageSyncService synchronization;

    @ModelAttribute
    public void responseHeaders(HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
    }

    @GetMapping("/list")
    @SaCheckPermission("system:tenant-package:list")
    public R<TenantPackageViews.Page> list(@RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "10") int pageSize) { return R.ok(service.list(pageNum, pageSize)); }

    @GetMapping("/{packageId}")
    @SaCheckPermission("system:tenant-package:list")
    public R<TenantPackageViews.Template> detail(@PathVariable long packageId) { return R.ok(service.detail(packageId)); }

    @GetMapping("/catalog")
    @SaCheckPermission("system:tenant-package:list")
    public R<TenantPackageViews.Catalog> catalog() { return R.ok(service.catalog()); }

    @PostMapping
    @SaCheckPermission("system:tenant-package:manage")
    @RepeatSubmit
    @RateLimiter(key = "auth:tenant-package:manage", time = 60, count = 20, limitType = LimitType.USER)
    @SysLog(value = "新增租户套餐模板", logParams = false)
    public R<TenantPackageViews.Template> create(@RequestBody @Valid TenantPackageSaveRequest request) { return R.ok(service.create(request)); }

    @PutMapping
    @SaCheckPermission("system:tenant-package:manage")
    @RepeatSubmit
    @RateLimiter(key = "auth:tenant-package:manage", time = 60, count = 20, limitType = LimitType.USER)
    @SysLog(value = "修改租户套餐模板", logParams = false)
    public R<TenantPackageViews.Template> update(@RequestBody @Valid TenantPackageSaveRequest request) { return R.ok(service.update(request)); }

    @PostMapping("/{packageId}/sync-preview")
    @SaCheckPermission("system:tenant-package:sync")
    @RepeatSubmit
    @RateLimiter(key = "auth:tenant-package:preview", time = 60, count = 10, limitType = LimitType.USER)
    @SysLog(value = "预览租户套餐同步", logParams = false)
    public R<TenantPackageSyncService.View> preview(@PathVariable long packageId,
            @RequestBody @Valid TenantPackageSyncRequests.Preview request) { return R.ok(synchronization.preview(packageId, request.tenantIds())); }

    @GetMapping("/sync/{syncId}")
    @SaCheckPermission("system:tenant-package:sync")
    public R<TenantPackageSyncService.View> synchronization(@PathVariable long syncId) { return R.ok(synchronization.detail(syncId)); }

    @PostMapping("/sync/{syncId}/confirm")
    @SaCheckPermission("system:tenant-package:sync")
    @RepeatSubmit.Disabled
    @RateLimiter(key = "auth:tenant-package:confirm", time = 60, count = 10, limitType = LimitType.USER)
    @SysLog(value = "确认租户套餐同步", logParams = false)
    public R<TenantPackageSyncService.View> confirm(@PathVariable long syncId,
            @RequestBody @Valid TenantPackageSyncRequests.Confirmation request) { return R.ok(synchronization.confirm(syncId, request.previewHash())); }

    @PostMapping("/sync/{syncId}/cancel")
    @SaCheckPermission("system:tenant-package:sync")
    @RepeatSubmit.Disabled
    @RateLimiter(key = "auth:tenant-package:cancel", time = 60, count = 10, limitType = LimitType.USER)
    @SysLog(value = "取消租户套餐同步", logParams = false)
    public R<TenantPackageSyncService.View> cancel(@PathVariable long syncId,
            @RequestBody @Valid TenantPackageSyncRequests.Confirmation request) { return R.ok(synchronization.cancel(syncId, request.previewHash())); }
}
