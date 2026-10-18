package com.cloudflow.hr.client;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.service.HrAdvanceApplicationRules.PublishedRule;
import java.util.List;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

@FeignClient(name = "cloudflow-auth", contextId = "hrAdvanceRuleClient", path = "/inner/auth/hr-advance-rules")
public interface HrAdvanceRuleClient {
    @GetMapping
    R<List<PublishedRule>> policy(@RequestParam("payrollDeduction") boolean payrollDeduction);
}
