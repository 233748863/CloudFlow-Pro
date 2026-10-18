package com.cloudflow.auth.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.domain.dto.TenantStatisticsDTO;
import com.cloudflow.auth.domain.dto.TenantStorageSummaryDTO;
import com.cloudflow.auth.service.ISysTenantService;
import com.cloudflow.auth.tenantpackage.TenantAssignmentService;
import com.cloudflow.auth.tenantpackage.TenantSaveRequest;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.ratelimiter.annotation.RateLimiter;
import com.cloudflow.common.ratelimiter.enums.LimitType;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.apache.commons.lang3.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;
import java.util.List;

@RestController
@RequestMapping("/system/tenant")
@RequiredArgsConstructor
public class SysTenantController {

    private final ISysTenantService sysTenantService;
    private final SysConfigHelper sysConfigHelper;
    private final com.cloudflow.auth.platform.PlatformAccessService platformAccess;
    private final TenantAssignmentService assignments;

    /** 兜底默认值：默认租户ID（实际值从 sys.tenant.defaultId 读取） */
    private static final long DEFAULT_TENANT_ID_FALLBACK = 100000L;

    private long defaultTenantId() {
        return sysConfigHelper.getConfigLong("sys.tenant.defaultId", DEFAULT_TENANT_ID_FALLBACK);
    }

    @GetMapping("/list")
    @SaCheckPermission("system:tenant:list")
    public R<IPage<SysTenant>> list(Page<SysTenant> page, SysTenant tenant) {
        platformAccess.requireRecent("system:tenant:list");
        LambdaQueryWrapper<SysTenant> wrapper = new LambdaQueryWrapper<>();
        wrapper.like(StringUtils.isNotBlank(tenant.getTenantCode()), SysTenant::getTenantCode, tenant.getTenantCode());
        wrapper.like(StringUtils.isNotBlank(tenant.getTenantName()), SysTenant::getTenantName, tenant.getTenantName());
        wrapper.like(StringUtils.isNotBlank(tenant.getContactName()), SysTenant::getContactName, tenant.getContactName());
        wrapper.eq(StringUtils.isNotBlank(tenant.getStatus()), SysTenant::getStatus, tenant.getStatus());
        wrapper.orderByDesc(SysTenant::getCreateTime);

        IPage<SysTenant> result = sysTenantService.page(page, wrapper);
        return R.ok(result);
    }

    @GetMapping("/{tenantId}")
    @SaCheckPermission("system:tenant:query")
    public R<SysTenant> getInfo(@PathVariable Long tenantId) {
        platformAccess.requireRecent("system:tenant:query");
        SysTenant tenant = sysTenantService.getById(tenantId);
        if (tenant == null) {
            return R.fail("租户不存在");
        }
        return R.ok(tenant);
    }

    @PostMapping
    @RepeatSubmit
    @SaCheckPermission("system:tenant:add")
    @RateLimiter(key = "auth:tenant:manage", time = 60, count = 20, limitType = LimitType.USER)
    @SysLog(value = "新增租户并分配套餐", logParams = false)
    public R<Void> add(@RequestBody @Valid TenantSaveRequest request) {
        assignments.create(request);
        return R.ok();
    }

    @PutMapping
    @RepeatSubmit
    @SaCheckPermission("system:tenant:edit")
    @RateLimiter(key = "auth:tenant:manage", time = 60, count = 20, limitType = LimitType.USER)
    @SysLog(value = "修改租户及明确套餐覆盖", logParams = false)
    public R<Void> edit(@RequestBody @Valid TenantSaveRequest request) {
        assignments.update(request);
        return R.ok();
    }

    @DeleteMapping("/{tenantId}")
    @SaCheckPermission("system:tenant:remove")
    public R<Void> remove(@PathVariable Long tenantId) {
        platformAccess.requireRecent("system:tenant:remove");
        if (tenantId == defaultTenantId()) {
            return R.fail("默认租户不能删除");
        }

        SysTenant tenant = sysTenantService.getById(tenantId);
        if (tenant == null) {
            return R.fail("租户不存在");
        }

        long activeUserCount = sysTenantService.countActiveUsers(tenantId);
        if (activeUserCount > 0) {
            return R.fail("租户下仍有 " + activeUserCount + " 个有效用户，无法删除");
        }

        boolean result = sysTenantService.removeById(tenantId);
        return result ? R.ok() : R.fail("删除租户失败");
    }

    @PutMapping("/{tenantId}/status")
    @RepeatSubmit
    @SaCheckPermission("system:tenant:edit")
    public R<Void> updateStatus(@PathVariable Long tenantId, @RequestParam String status) {
        platformAccess.requireRecent("system:tenant:edit");
        if (tenantId == defaultTenantId()) {
            return R.fail("默认租户状态不能修改");
        }

        SysTenant tenant = sysTenantService.getById(tenantId);
        if (tenant == null) {
            return R.fail("租户不存在");
        }

        tenant.setStatus(status);
        boolean result = sysTenantService.updateById(tenant);
        return result ? R.ok() : R.fail("更新租户状态失败");
    }

    @GetMapping("/statistics")
    @SaCheckPermission("system:tenant:list")
    public R<List<TenantStatisticsDTO>> getTenantStatisticsBatch(@RequestParam(required = false) List<Long> tenantIds) {
        platformAccess.requireRecent("system:tenant:list");
        if (tenantIds == null || tenantIds.isEmpty()) {
            return R.ok(Collections.emptyList());
        }
        return R.ok(sysTenantService.getTenantStatisticsBatch(tenantIds));
    }

    @PostMapping("/{tenantId}/storage/refresh")
    @RepeatSubmit
    @SaCheckPermission("system:tenant:edit")
    public R<TenantStorageSummaryDTO> refreshTenantStorage(@PathVariable Long tenantId) {
        platformAccess.requireRecent("system:tenant:edit");
        SysTenant tenant = sysTenantService.getById(tenantId);
        if (tenant == null) {
            return R.fail("租户不存在");
        }
        return R.ok(sysTenantService.refreshTenantStorageSummary(tenantId));
    }

    @GetMapping("/{tenantId}/check")
    @SaCheckPermission("system:tenant:query")
    public R<TenantStatisticsDTO> checkTenantStatus(@PathVariable Long tenantId) {
        platformAccess.requireRecent("system:tenant:query");
        return R.ok(sysTenantService.getTenantStatistics(tenantId));
    }

}
