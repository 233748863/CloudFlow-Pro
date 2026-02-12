package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.auth.domain.SysTenant;

/**
 * 租户Service接口
 * 
 * @author CloudFlow
 */
public interface SysTenantService extends IService<SysTenant> {
    
    /**
     * 检查租户是否已过期
     * 
     * @param tenantId 租户ID
     * @return true-已过期 false-未过期
     */
    boolean isTenantExpired(Long tenantId);
    
    /**
     * 检查租户是否已停用
     * 
     * @param tenantId 租户ID
     * @return true-已停用 false-正常
     */
    boolean isTenantDisabled(Long tenantId);
    
    /**
     * 检查租户用户数量是否已达上限
     * 
     * @param tenantId 租户ID
     * @return true-已达上限 false-未达上限
     */
    boolean isUserLimitReached(Long tenantId);
    
    /**
     * 更新租户存储使用量
     * 
     * @param tenantId 租户ID
     * @param size 增加的存储大小(MB)
     * @return 更新结果
     */
    boolean updateStorageUsed(Long tenantId, Long size);
}
