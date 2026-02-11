package com.cloudflow.auth.service;

import com.cloudflow.auth.domain.SysTenant;
import java.util.List;

/**
 * 租户信息Service接口
 */
public interface ISysTenantService {
    
    /**
     * 查询租户列表
     */
    List<SysTenant> selectTenantList(SysTenant tenant);
    
    /**
     * 根据租户ID查询租户信息
     */
    SysTenant selectTenantById(Long tenantId);
    
    /**
     * 新增租户
     */
    int insertTenant(SysTenant tenant);
    
    /**
     * 修改租户
     */
    int updateTenant(SysTenant tenant);
    
    /**
     * 批量删除租户
     */
    int deleteTenantByIds(Long[] tenantIds);
    
    /**
     * 校验租户名称是否唯一
     */
    String checkTenantNameUnique(SysTenant tenant);
    
    /**
     * 修改租户状态
     */
    int updateTenantStatus(SysTenant tenant);
    
    /**
     * 获取租户统计信息
     */
    SysTenant getTenantStatistics(Long tenantId);
}
