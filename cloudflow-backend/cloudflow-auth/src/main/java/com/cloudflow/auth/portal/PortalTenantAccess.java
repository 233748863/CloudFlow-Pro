package com.cloudflow.auth.portal;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.mapper.SysTenantMapper;
import com.cloudflow.common.tenant.TenantBroker;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class PortalTenantAccess {
    private final SysTenantMapper tenants;

    public SysTenant byCode(String code) {
        if (code == null || !code.matches("[A-Za-z0-9][A-Za-z0-9_-]{0,49}")) return null;
        SysTenant tenant = TenantBroker.applyWithoutTenant(ignored -> tenants.selectOne(new LambdaQueryWrapper<SysTenant>()
                .eq(SysTenant::getTenantCode, code).eq(SysTenant::getDeleted, 0)));
        return active(tenant) ? tenant : null;
    }

    public SysTenant byId(Long tenantId) {
        SysTenant tenant = TenantBroker.applyWithoutTenant(ignored -> tenants.selectById(tenantId));
        return active(tenant) ? tenant : null;
    }

    private static boolean active(SysTenant tenant) {
        return tenant != null && Integer.valueOf(0).equals(tenant.getDeleted()) && "0".equals(tenant.getStatus())
                && (tenant.getExpireTime() == null || tenant.getExpireTime().isAfter(LocalDateTime.now()));
    }
}
