package com.cloudflow.auth.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.domain.dto.TenantStatisticsDTO;
import com.cloudflow.auth.domain.dto.TenantStorageSummaryDTO;
import com.cloudflow.auth.service.ISysTenantService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.redis.core.SysConfigHelper;
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

    /** 兜底默认值：默认租户ID（实际值从 sys.tenant.defaultId 读取） */
    private static final long DEFAULT_TENANT_ID_FALLBACK = 100000L;

    private long defaultTenantId() {
        return sysConfigHelper.getConfigLong("sys.tenant.defaultId", DEFAULT_TENANT_ID_FALLBACK);
    }

    @GetMapping("/list")
    @SaCheckPermission("system:tenant:list")
    public R<IPage<SysTenant>> list(Page<SysTenant> page, SysTenant tenant) {
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
        SysTenant tenant = sysTenantService.getById(tenantId);
        if (tenant == null) {
            return R.fail("租户不存在");
        }
        return R.ok(tenant);
    }

    @PostMapping
    @RepeatSubmit
    @SaCheckPermission("system:tenant:add")
    public R<Void> add(@RequestBody SysTenant tenant) {
        normalizeTenantCode(tenant);
        if (StringUtils.isBlank(tenant.getTenantCode())) {
            return R.fail("租户编码不能为空");
        }

        LambdaQueryWrapper<SysTenant> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysTenant::getTenantName, tenant.getTenantName());
        if (sysTenantService.count(wrapper) > 0) {
            return R.fail("租户名称已存在");
        }

        if (sysTenantService.count(new LambdaQueryWrapper<SysTenant>()
                .eq(SysTenant::getTenantCode, tenant.getTenantCode())) > 0) {
            return R.fail("租户编码已存在");
        }

        if (tenant.getStatus() == null) {
            tenant.setStatus("0");
        }
        if (tenant.getUserLimit() == null) {
            tenant.setUserLimit(100);
        }
        if (tenant.getStorageLimit() == null) {
            tenant.setStorageLimit(10240L);
        }
        if (tenant.getStorageUsed() == null) {
            tenant.setStorageUsed(0L);
        }

        boolean result = sysTenantService.save(tenant);
        return result ? R.ok() : R.fail("新增租户失败");
    }

    @PutMapping
    @RepeatSubmit
    @SaCheckPermission("system:tenant:edit")
    public R<Void> edit(@RequestBody SysTenant tenant) {
        if (tenant.getTenantId() == null) {
            return R.fail("租户ID不能为空");
        }

        SysTenant existTenant = sysTenantService.getById(tenant.getTenantId());
        if (existTenant == null) {
            return R.fail("租户不存在");
        }
        normalizeTenantCode(tenant);
        if (StringUtils.isBlank(tenant.getTenantCode())) {
            return R.fail("租户编码不能为空");
        }

        if (!existTenant.getTenantName().equals(tenant.getTenantName())) {
            LambdaQueryWrapper<SysTenant> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(SysTenant::getTenantName, tenant.getTenantName());
            wrapper.ne(SysTenant::getTenantId, tenant.getTenantId());
            if (sysTenantService.count(wrapper) > 0) {
                return R.fail("租户名称已存在");
            }
        }

        if (!tenant.getTenantCode().equals(existTenant.getTenantCode())) {
            LambdaQueryWrapper<SysTenant> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(SysTenant::getTenantCode, tenant.getTenantCode());
            wrapper.ne(SysTenant::getTenantId, tenant.getTenantId());
            if (sysTenantService.count(wrapper) > 0) {
                return R.fail("租户编码已存在");
            }
        }

        boolean result = sysTenantService.updateById(tenant);
        return result ? R.ok() : R.fail("修改租户失败");
    }

    @DeleteMapping("/{tenantId}")
    @SaCheckPermission("system:tenant:remove")
    public R<Void> remove(@PathVariable Long tenantId) {
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
        if (tenantIds == null || tenantIds.isEmpty()) {
            return R.ok(Collections.emptyList());
        }
        return R.ok(sysTenantService.getTenantStatisticsBatch(tenantIds));
    }

    @PostMapping("/{tenantId}/storage/refresh")
    @RepeatSubmit
    @SaCheckPermission("system:tenant:edit")
    public R<TenantStorageSummaryDTO> refreshTenantStorage(@PathVariable Long tenantId) {
        SysTenant tenant = sysTenantService.getById(tenantId);
        if (tenant == null) {
            return R.fail("租户不存在");
        }
        return R.ok(sysTenantService.refreshTenantStorageSummary(tenantId));
    }

    @GetMapping("/{tenantId}/check")
    @SaCheckPermission("system:tenant:query")
    public R<TenantStatisticsDTO> checkTenantStatus(@PathVariable Long tenantId) {
        return R.ok(sysTenantService.getTenantStatistics(tenantId));
    }

    private void normalizeTenantCode(SysTenant tenant) {
        if (tenant == null || tenant.getTenantCode() == null) {
            return;
        }
        tenant.setTenantCode(tenant.getTenantCode().trim());
    }
}
