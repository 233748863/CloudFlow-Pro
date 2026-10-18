package com.cloudflow.common.tenant.quota;

import com.cloudflow.common.tenant.quota.mapper.TenantQuotaMapper;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@MapperScan("com.cloudflow.common.tenant.quota.mapper")
public class TenantQuotaConfiguration {
    @Bean
    public TenantQuotaService tenantQuotaService(TenantQuotaMapper mapper) {
        return new TenantQuotaService(mapper);
    }
}
