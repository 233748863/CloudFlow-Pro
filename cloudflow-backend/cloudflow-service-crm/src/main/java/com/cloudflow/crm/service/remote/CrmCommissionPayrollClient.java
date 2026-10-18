package com.cloudflow.crm.service.remote;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.commission.CommissionEvents.Progress;
import com.cloudflow.common.event.commission.CommissionEvents.Reference;
import com.cloudflow.common.event.commission.CommissionEvents.Selection;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "cloudflow-service-hr", contextId = "crmCommissionPayrollClient", path = "/inner/hr/comp-change/commission")
public interface CrmCommissionPayrollClient {
    @PostMapping
    R<Progress> synchronize(@RequestBody Reference request);
    @PostMapping("/validate")
    R<Void> validateSelection(@RequestBody Selection request);
}
