package com.cloudflow.oa.service.remote;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.dto.BusinessRuleDTO;
import com.cloudflow.oa.domain.dto.BusinessRuleHitRecordDTO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "cloudflow-auth", contextId = "oaRemoteConsumableRuleService")
public interface RemoteConsumableRuleService {
    @GetMapping("/inner/auth/oa-consumable-rules/effective/{ruleCode}")
    R<BusinessRuleDTO> getEffectiveRule(@PathVariable("ruleCode") String ruleCode);

    @PostMapping("/inner/auth/oa-consumable-rules/hit-records")
    R<Void> recordHit(@RequestBody BusinessRuleHitRecordDTO record);
}
