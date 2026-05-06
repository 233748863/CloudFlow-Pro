package com.cloudflow.oa.service.remote;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.dto.BusinessRuleDTO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

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
}
