package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.crm.service.remote.RemoteOaFallbackFactory;
import com.cloudflow.crm.service.remote.RemoteOaService;
import java.net.URL;
import java.time.Duration;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.TimeoutException;
import org.springframework.boot.convert.DurationStyle;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.UrlResource;
import static com.cloudflow.crm.service.impl.CrmOperationsChecks.*;

final class CrmQuoteContractAvailabilityChecks {
    static void run() throws Exception {
        int before = assertionCount();
        URL classes = RemoteOaService.class.getProtectionDomain().getCodeSource().getLocation();
        List<PropertySource<?>> properties = new YamlPropertySourceLoader().load("crm-application", new UrlResource(new URL(classes, "application.yml")));
        String operation = feign.Feign.configKey(RemoteOaService.class, RemoteOaService.class.getMethod("createContract", String.class, String.class, RemoteOaService.ContractDraftRequest.class))
                .replaceAll("[^a-zA-Z0-9]", "");
        equal("RemoteOaServicecreateContractStringStringContractDraftRequest", operation, "contract timeout uses the actual Feign operation identifier");
        String property = "resilience4j.timelimiter.instances." + operation + ".timeout-duration";
        Object configured = properties.stream().map(source -> source.getProperty(property)).filter(Objects::nonNull).findFirst().orElseThrow();
        equal(Duration.ofSeconds(15), DurationStyle.detectAndParse(configured.toString()), "contract copy permits the scoped fifteen-second deadline instead of the one-second default");
        RemoteOaService unavailable = new RemoteOaFallbackFactory().create(new TimeoutException("isolated contract response timeout"));
        R<Long> response = unavailable.createContract("true", "cloudflow-service-crm", new RemoteOaService.ContractDraftRequest());
        check(!response.isSuccess() && response.getData() == null, "contract timeout does not pretend that contract creation succeeded");
        check(response.getMsg().contains("结果尚未确认") && response.getMsg().contains("同一报价"), "contract timeout directs reconciliation rather than claiming that OA never created a contract");
        System.out.println("H3_QUOTE_CONTRACT_AVAILABILITY_CHECKS: assertions=" + (assertionCount() - before)
                + "; failed=0; configured_timeout_ms=15000; fallback_success=false; http=false");
    }
}
