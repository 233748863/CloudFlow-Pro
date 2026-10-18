package com.cloudflow.crm.service.remote;

import com.cloudflow.common.core.domain.R;
import lombok.Data;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.*;
import java.math.BigDecimal;

@FeignClient(name = "cloudflow-auth", contextId = "crmBusinessRuleClient", path = "/inner/auth/crm-rules")
public interface CrmBusinessRuleClient {
    @GetMapping("/effective/{code}")
    R<Rule> effective(@PathVariable("code") String code);
    @PostMapping("/hit-records")
    R<Void> recordHit(@RequestBody Hit hit);

    @Data
    class Rule {
        private String ruleCode;
        private BigDecimal thresholdValue;
        private String effect;
        private Integer enabled;
    }

    @Data
    class Hit {
        private Long tenantId;
        private String ruleCode;
        private String businessType;
        private Long businessId;
        private BigDecimal thresholdValue;
        private BigDecimal actualValue;
        private String effect;
        private String hitResult;
    }
}
