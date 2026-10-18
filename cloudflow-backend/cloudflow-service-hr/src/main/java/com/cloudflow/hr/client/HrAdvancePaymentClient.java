package com.cloudflow.hr.client;

import com.cloudflow.common.core.domain.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "cloudflow-service-oa", contextId = "hrAdvancePaymentClient", path = "/inner/oa/payment")
public interface HrAdvancePaymentClient {
    @PostMapping("/hr-source")
    R<Long> create(@RequestBody Source input);
    record Source(String sourceType, Long sourceId) { }
}
