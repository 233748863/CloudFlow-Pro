package com.cloudflow.oa.service.remote;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.dto.BusinessRuleDTO;
import com.cloudflow.oa.domain.dto.BusinessRuleHitRecordDTO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

/**
 * 远程业务规则服务。
 */
@FeignClient(
        name = "cloudflow-auth",
        fallbackFactory = RemoteBusinessRuleFallbackFactory.class
)
public interface RemoteBusinessRuleService {

    @GetMapping("/system/rules/effective/{ruleCode}")
    R<BusinessRuleDTO> getEffectiveRule(@PathVariable("ruleCode") String ruleCode);

    @PostMapping("/system/rules/hit-records")
    R<Void> recordHit(@RequestBody BusinessRuleHitRecordDTO record);
}
