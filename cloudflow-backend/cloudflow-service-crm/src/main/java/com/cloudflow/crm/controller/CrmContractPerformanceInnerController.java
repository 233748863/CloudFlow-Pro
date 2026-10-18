package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.crm.service.deal.CrmContractPerformanceService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/crm/deal-event")
@RequiredArgsConstructor
public class CrmContractPerformanceInnerController {
    private final CrmContractPerformanceService performance;
    public record SourceRequest(String eventId) { }

    @PostMapping("/contract")
    @RepeatSubmit.Disabled
    @Inner(allowedServices = "cloudflow-service-oa")
    public R<Void> synchronize(@RequestBody SourceRequest request) {
        performance.synchronize(request == null ? null : request.eventId());
        return R.ok();
    }
}
