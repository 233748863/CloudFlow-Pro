package com.cloudflow.auth.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.service.SysTenantService;
import com.cloudflow.common.core.domain.R;
import lombok.RequiredArgsConstructor;
import org.apache.commons.lang3.StringUtils;
import org.springframework.web.bind.annotation.*;

/**
 * 租户管理Controller
 * 
 * @author CloudFlow
 */
@RestController
@RequestMapping("/system/tenant")
@RequiredArgsConstructor
public class SysTenantController {
    
    private final SysTenantService tenantService;
    
    /**
     * 分页查询租户列表
     * 
     * @param page 分页参数
     * @param tenant 查询条件
     * @return 租户列表
     */
    @GetMapping("/list")
    public R<IPage<SysTenant>> list(Page<SysTenant> page, SysTenant tenant) {
        LambdaQueryWrapper<SysTenant> wrapper = new LambdaQueryWrapper<>();
        wrapper.like(StringUtils.isNotBlank(tenant.getTenantName()), 
            SysTenant::getTenantName, tenant.getTenantName());
        wrapper.like(StringUtils.isNotBlank(tenant.getContactName()), 
            SysTenant::getContactName, tenant.getContactName());
        wrapper.eq(StringUtils.isNotBlank(tenant.getStatus()), 
            SysTenant::getStatus, tenant.getStatus());
        wrapper.orderByDesc(SysTenant::getCreateTime);
        
        IPage<SysTenant> result = tenantService.page(page, wrapper);
        return R.ok(result);
    }
    
    /**
     * 获取租户详情
     * 
     * @param tenantId 租户ID
     * @return 租户详情
     */
    @GetMapping("/{tenantId}")
    public R<SysTenant> getInfo(@PathVariable Long tenantId) {
        SysTenant tenant = tenantService.getById(tenantId);
        if (tenant == null) {
            return R.fail("租户不存在");
        }
        return R.ok(tenant);
    }
    
    /**
     * 新增租户
     * 
     * @param tenant 租户信息
     * @return 操作结果
     */
    @PostMapping
    public R<Void> add(@RequestBody SysTenant tenant) {
        // 检查租户名称是否已存在
        LambdaQueryWrapper<SysTenant> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysTenant::getTenantName, tenant.getTenantName());
        if (tenantService.count(wrapper) > 0) {
            return R.fail("租户名称已存在");
        }
        
        // 设置默认值
        if (tenant.getStatus() == null) {
            tenant.setStatus("0"); // 默认正常状态
        }
        if (tenant.getUserLimit() == null) {
            tenant.setUserLimit(100); // 默认用户限制100
        }
        if (tenant.getStorageLimit() == null) {
            tenant.setStorageLimit(10240L); // 默认存储限制10GB
        }
        if (tenant.getStorageUsed() == null) {
            tenant.setStorageUsed(0L);
        }
        
        boolean result = tenantService.save(tenant);
        return result ? R.ok() : R.fail("新增租户失败");
    }
    
    /**
     * 修改租户
     * 
     * @param tenant 租户信息
     * @return 操作结果
     */
    @PutMapping
    public R<Void> edit(@RequestBody SysTenant tenant) {
        if (tenant.getTenantId() == null) {
            return R.fail("租户ID不能为空");
        }
        
        // 检查租户是否存在
        SysTenant existTenant = tenantService.getById(tenant.getTenantId());
        if (existTenant == null) {
            return R.fail("租户不存在");
        }
        
        // 如果修改了租户名称，检查是否与其他租户重复
        if (!existTenant.getTenantName().equals(tenant.getTenantName())) {
            LambdaQueryWrapper<SysTenant> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(SysTenant::getTenantName, tenant.getTenantName());
            wrapper.ne(SysTenant::getTenantId, tenant.getTenantId());
            if (tenantService.count(wrapper) > 0) {
                return R.fail("租户名称已存在");
            }
        }
        
        boolean result = tenantService.updateById(tenant);
        return result ? R.ok() : R.fail("修改租户失败");
    }
    
    /**
     * 删除租户
     * 
     * @param tenantId 租户ID
     * @return 操作结果
     */
    @DeleteMapping("/{tenantId}")
    public R<Void> remove(@PathVariable Long tenantId) {
        // 检查是否为默认租户
        if (tenantId == 100000L) {
            return R.fail("默认租户不能删除");
        }
        
        // TODO: 检查租户下是否还有用户，如果有则不允许删除
        
        boolean result = tenantService.removeById(tenantId);
        return result ? R.ok() : R.fail("删除租户失败");
    }
    
    /**
     * 更新租户状态
     * 
     * @param tenantId 租户ID
     * @param status 状态（0正常 1停用）
     * @return 操作结果
     */
    @PutMapping("/{tenantId}/status")
    public R<Void> updateStatus(@PathVariable Long tenantId, @RequestParam String status) {
        // 检查是否为默认租户
        if (tenantId == 100000L) {
            return R.fail("默认租户状态不能修改");
        }
        
        SysTenant tenant = tenantService.getById(tenantId);
        if (tenant == null) {
            return R.fail("租户不存在");
        }
        
        tenant.setStatus(status);
        boolean result = tenantService.updateById(tenant);
        return result ? R.ok() : R.fail("更新租户状态失败");
    }
    
    /**
     * 检查租户状态
     * 
     * @param tenantId 租户ID
     * @return 租户状态信息
     */
    @GetMapping("/{tenantId}/check")
    public R<Object> checkTenantStatus(@PathVariable Long tenantId) {
        boolean isExpired = tenantService.isTenantExpired(tenantId);
        boolean isDisabled = tenantService.isTenantDisabled(tenantId);
        boolean isUserLimitReached = tenantService.isUserLimitReached(tenantId);
        
        return R.ok(new Object() {
            public final boolean expired = isExpired;
            public final boolean disabled = isDisabled;
            public final boolean userLimitReached = isUserLimitReached;
        });
    }
}
