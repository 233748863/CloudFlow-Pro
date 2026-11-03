package com.cloudflow.auth.service.report;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.mapper.SysTenantMapper;
import com.cloudflow.common.tenant.TenantBroker;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
@RequiredArgsConstructor
public class ReportDatasetInitializer implements ApplicationRunner {
    private final SysTenantMapper tenants;
    private final ReportDatasetRegistration registrations;

    @Override
    public void run(ApplicationArguments arguments) {
        List<SysTenant> existing = TenantBroker.applyWithoutTenant(ignored -> tenants.selectList(
                new LambdaQueryWrapper<SysTenant>().select(SysTenant::getTenantId).eq(SysTenant::getDeleted, 0)));
        for (SysTenant tenant : existing) {
            TenantBroker.runAs(tenant.getTenantId(), registrations::registerTenant);
        }
    }
}
