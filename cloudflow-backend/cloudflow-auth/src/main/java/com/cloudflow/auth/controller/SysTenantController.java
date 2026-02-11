package com.cloudflow.auth.controller;

import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.service.ISysTenantService;
import com.cloudflow.common.core.domain.R;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 租户信息Controller
 */
@RestController
@RequestMapping("/system/tenant")
public class SysTenantController {

    @Autowired
    private ISysTenantService tenantService;

    /**
     * 查询租户列表
     */
    @GetMapping("/list")
    public R<List<SysTenant>> list(SysTenant tenant) {
        List<SysTenant> list = tenantService.selectTenantList(tenant);
        return R.ok(list);
    }

    /**
     * 根据租户ID获取详细信息
     */
    @GetMapping("/{tenantId}")
    public R<SysTenant> getInfo(@PathVariable Long tenantId) {
        return R.ok(tenantService.selectTenantById(tenantId));
    }

    /**
     * 新增租户
     */
    @PostMapping
    public R<?> add(@RequestBody SysTenant tenant) {
        if ("1".equals(tenantService.checkTenantNameUnique(tenant))) {
            return R.fail("新增租户'" + tenant.getTenantName() + "'失败，租户名称已存在");
        }
        return R.ok(tenantService.insertTenant(tenant));
    }

    /**
     * 修改租户
     */
    @PutMapping
    public R<?> edit(@RequestBody SysTenant tenant) {
        if ("1".equals(tenantService.checkTenantNameUnique(tenant))) {
            return R.fail("修改租户'" + tenant.getTenantName() + "'失败，租户名称已存在");
        }
        return R.ok(tenantService.updateTenant(tenant));
    }

    /**
     * 删除租户
     */
    @DeleteMapping("/{tenantIds}")
    public R<?> remove(@PathVariable Long[] tenantIds) {
        return R.ok(tenantService.deleteTenantByIds(tenantIds));
    }

    /**
     * 修改租户状态
     */
    @PutMapping("/changeStatus")
    public R<?> changeStatus(@RequestBody SysTenant tenant) {
        return R.ok(tenantService.updateTenantStatus(tenant));
    }

    /**
     * 获取租户统计信息
     */
    @GetMapping("/statistics/{tenantId}")
    public R<SysTenant> getStatistics(@PathVariable Long tenantId) {
        return R.ok(tenantService.getTenantStatistics(tenantId));
    }
}
