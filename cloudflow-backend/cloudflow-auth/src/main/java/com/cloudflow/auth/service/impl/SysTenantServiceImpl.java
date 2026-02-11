package com.cloudflow.auth.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.mapper.SysTenantMapper;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.auth.service.ISysTenantService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.Date;
import java.util.List;

/**
 * 租户信息Service实现
 */
@Service
public class SysTenantServiceImpl implements ISysTenantService {

    @Autowired
    private SysTenantMapper sysTenantMapper;
    
    @Autowired
    private SysUserMapper sysUserMapper;

    @Override
    public List<SysTenant> selectTenantList(SysTenant tenant) {
        LambdaQueryWrapper<SysTenant> wrapper = new LambdaQueryWrapper<>();
        
        if (StringUtils.hasText(tenant.getTenantName())) {
            wrapper.like(SysTenant::getTenantName, tenant.getTenantName());
        }
        if (StringUtils.hasText(tenant.getContactName())) {
            wrapper.like(SysTenant::getContactName, tenant.getContactName());
        }
        if (StringUtils.hasText(tenant.getContactPhone())) {
            wrapper.like(SysTenant::getContactPhone, tenant.getContactPhone());
        }
        if (StringUtils.hasText(tenant.getStatus())) {
            wrapper.eq(SysTenant::getStatus, tenant.getStatus());
        }
        
        wrapper.eq(SysTenant::getDelFlag, "0");
        wrapper.orderByDesc(SysTenant::getCreateTime);
        
        return sysTenantMapper.selectList(wrapper);
    }

    @Override
    public SysTenant selectTenantById(Long tenantId) {
        return sysTenantMapper.selectById(tenantId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int insertTenant(SysTenant tenant) {
        tenant.setCreateTime(new Date());
        tenant.setDelFlag("0");
        if (tenant.getStatus() == null) {
            tenant.setStatus("0"); // 默认正常状态
        }
        if (tenant.getStorageUsed() == null) {
            tenant.setStorageUsed(0L);
        }
        return sysTenantMapper.insert(tenant);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int updateTenant(SysTenant tenant) {
        tenant.setUpdateTime(new Date());
        return sysTenantMapper.updateById(tenant);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int deleteTenantByIds(Long[] tenantIds) {
        int count = 0;
        for (Long tenantId : tenantIds) {
            // 检查租户下是否有用户
            LambdaQueryWrapper<SysUser> userWrapper = new LambdaQueryWrapper<>();
            userWrapper.eq(SysUser::getTenantId, tenantId);
            long userCount = sysUserMapper.selectCount(userWrapper);
            
            if (userCount > 0) {
                throw new RuntimeException("租户下存在用户，无法删除");
            }
            
            // 逻辑删除
            SysTenant tenant = new SysTenant();
            tenant.setTenantId(tenantId);
            tenant.setDelFlag("2");
            tenant.setUpdateTime(new Date());
            count += sysTenantMapper.updateById(tenant);
        }
        return count;
    }

    @Override
    public String checkTenantNameUnique(SysTenant tenant) {
        LambdaQueryWrapper<SysTenant> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysTenant::getTenantName, tenant.getTenantName());
        wrapper.eq(SysTenant::getDelFlag, "0");
        
        SysTenant info = sysTenantMapper.selectOne(wrapper);
        if (info != null && !info.getTenantId().equals(tenant.getTenantId())) {
            return "1"; // 不唯一
        }
        return "0"; // 唯一
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int updateTenantStatus(SysTenant tenant) {
        tenant.setUpdateTime(new Date());
        return sysTenantMapper.updateById(tenant);
    }

    @Override
    public SysTenant getTenantStatistics(Long tenantId) {
        SysTenant tenant = sysTenantMapper.selectById(tenantId);
        if (tenant != null) {
            // 统计租户下的用户数量
            LambdaQueryWrapper<SysUser> userWrapper = new LambdaQueryWrapper<>();
            userWrapper.eq(SysUser::getTenantId, tenantId);
            userWrapper.eq(SysUser::getDelFlag, "0");
            long userCount = sysUserMapper.selectCount(userWrapper);
            
            // 这里可以添加更多统计信息，如存储使用情况等
            // tenant.setCurrentUserCount(userCount); // 需要在实体类中添加此字段
        }
        return tenant;
    }
}
