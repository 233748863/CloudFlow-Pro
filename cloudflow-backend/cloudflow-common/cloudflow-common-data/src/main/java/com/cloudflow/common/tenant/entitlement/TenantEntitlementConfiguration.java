package com.cloudflow.common.tenant.entitlement;

import com.cloudflow.common.core.permission.TenantPermissionPolicy;
import com.cloudflow.common.tenant.entitlement.mapper.TenantEntitlementMapper;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@MapperScan("com.cloudflow.common.tenant.entitlement.mapper")
public class TenantEntitlementConfiguration {
    @Bean
    public TenantPermissionPolicy tenantPermissionPolicy(TenantEntitlementMapper mapper, PlatformTransactionManager transactions) {
        return new TenantPermissionPolicyService(mapper, transactions);
    }
}
