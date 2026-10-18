package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.crm.domain.vo.HrEmployeeSummaryVO;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.service.deal.CrmDealMemberResolver;
import com.cloudflow.crm.service.remote.RemoteHrFallbackFactory;
import com.cloudflow.crm.service.remote.RemoteHrService;
import java.math.BigDecimal;
import java.net.URL;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.TimeoutException;
import org.springframework.boot.convert.DurationStyle;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.UrlResource;

import static com.cloudflow.crm.service.impl.CrmOperationsChecks.*;

final class CrmDirectoryAvailabilityChecks {
    static void run() throws Exception {
        int before = assertionCount();
        URL classes = RemoteHrService.class.getProtectionDomain().getCodeSource().getLocation();
        List<PropertySource<?>> properties = new YamlPropertySourceLoader().load("crm-application", new UrlResource(new URL(classes, "application.yml")));
        String operation = feign.Feign.configKey(RemoteHrService.class, RemoteHrService.class.getMethod("listEmployeesByUserIds", List.class))
                .replaceAll("[^a-zA-Z0-9]", "");
        equal("RemoteHrServicelistEmployeesByUserIdsList", operation, "directory timeout uses the actual Feign operation identifier");
        String property = "resilience4j.timelimiter.instances." + operation + ".timeout-duration";
        Object configured = properties.stream().map(source -> source.getProperty(property)).filter(java.util.Objects::nonNull).findFirst().orElseThrow();
        equal(Duration.ofSeconds(5), DurationStyle.detectAndParse(configured.toString()), "CRM employee verification has an explicit five-second timeout");
        RemoteHrService unavailable = new RemoteHrFallbackFactory().create(new TimeoutException("directory verification timeout"));
        R<List<HrEmployeeSummaryVO>> result = unavailable.listEmployeesByUserIds(List.of(1L));
        check(!result.isSuccess() && result.getData() == null, "directory outage is a failure rather than a successful empty employee list");
        CrmDealMemberResolver resolver = new CrmDealMemberResolver(unavailable);
        fails(CrmBusinessException.class, () -> resolver.resolve(List.of(new CrmDealMemberResolver.Assignment(1L, "OWNER", BigDecimal.ONE, null))),
                "employee verification failure prevents a business team from being accepted");
        System.out.println("H3_DIRECTORY_AVAILABILITY_CHECKS: assertions=" + (assertionCount() - before)
                + "; failed=0; configured_timeout_ms=5000; fallback_success=false; http=false");
    }
}
