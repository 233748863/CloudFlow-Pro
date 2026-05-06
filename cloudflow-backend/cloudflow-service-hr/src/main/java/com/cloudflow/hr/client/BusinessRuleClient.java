package com.cloudflow.hr.client;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.dto.BusinessRuleDTO;
import com.cloudflow.hr.client.dto.BusinessRuleHitRecordDTO;
import com.cloudflow.hr.client.fallback.BusinessRuleClientFallback;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

/**
 * Auth 业务规则客户端。
 */
@FeignClient(
        name = "cloudflow-auth",
        contextId = "hrBusinessRuleClient",
        fallback = BusinessRuleClientFallback.class
)
public interface BusinessRuleClient {

    @GetMapping("/system/rules/effective/{ruleCode}")
    R<BusinessRuleDTO> getEffectiveRule(@PathVariable("ruleCode") String ruleCode);

    @PostMapping("/system/rules/hit-records")
    R<Void> recordHit(@RequestBody BusinessRuleHitRecordDTO record);
}
