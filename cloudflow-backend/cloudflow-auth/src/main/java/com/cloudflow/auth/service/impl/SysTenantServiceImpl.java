package com.cloudflow.auth.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.mapper.SysTenantMapper;
import com.cloudflow.auth.service.SysTenantService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

/**
 * 租户Service实现类
 * 
 * @author CloudFlow
 */
@Slf4j
@Service
public class SysTenantServiceImpl extends ServiceImpl<SysTenantMapper, SysTenant> implements SysTenantService {
    
    @Override
    public boolean isTenantExpired(Long tenantId) {
        SysTenant tenant = this.getById(tenantId);
        if (tenant == null) {
            return true;
        }
        
        LocalDateTime expireTime = tenant.getExpireTime();
        if (expireTime == null) {
            // 如果没有设置过期时间，则认为永不过期
            return false;
        }
        
        return LocalDateTime.now().isAfter(expireTime);
    }
    
    @Override
    public boolean isTenantDisabled(Long tenantId) {
        SysTenant tenant = this.getById(tenantId);
        if (tenant == null) {
            return true;
        }
        
        // 状态：0正常 1停用
        return "1".equals(tenant.getStatus());
    }
    
    @Override
    public boolean isUserLimitReached(Long tenantId) {
        SysTenant tenant = this.getById(tenantId);
        if (tenant == null) {
            return true;
        }
        
        Integer userLimit = tenant.getUserLimit();
        if (userLimit == null || userLimit <= 0) {
            // 如果没有设置用户限制或限制为0，则认为无限制
            return false;
        }
        
        // TODO: 查询当前租户的用户数量
        // 这里需要注入UserService来查询用户数量
        // 暂时返回false，后续完善
        return false;
    }
    
    @Override
    public boolean updateStorageUsed(Long tenantId, Long size) {
        SysTenant tenant = this.getById(tenantId);
        if (tenant == null) {
            log.warn("租户不存在: {}", tenantId);
            return false;
        }
        
        Long currentUsed = tenant.getStorageUsed() != null ? tenant.getStorageUsed() : 0L;
        Long newUsed = currentUsed + size;
        
        // 确保已用空间不会变成负数（删除文件回收空间时）
        if (newUsed < 0) {
            newUsed = 0L;
        }
        
        // 检查是否超过存储限制（仅在增加空间时检查）
        Long storageLimit = tenant.getStorageLimit();
        if (size > 0 && storageLimit != null && storageLimit > 0 && newUsed > storageLimit) {
            log.warn("租户 {} 存储空间已达上限，当前使用: {}MB, 限制: {}MB", 
                tenantId, newUsed, storageLimit);
            return false;
        }
        
        tenant.setStorageUsed(newUsed);
        return this.updateById(tenant);
    }
}
