package com.cloudflow.hr.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.commission.CommissionEvents.Progress;
import com.cloudflow.common.event.commission.CommissionEvents.Reference;
import com.cloudflow.common.event.commission.CommissionEvents.Selection;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.hr.service.HrCommissionService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/hr/comp-change/commission")
@RequiredArgsConstructor
public class InnerHrCommissionController {
    private final HrCommissionService commissions;
    @PostMapping
    @RepeatSubmit.Disabled
    @Inner(allowedServices = "cloudflow-service-crm")
    public R<Progress> synchronize(@RequestBody Reference request) {
        return R.ok(commissions.synchronize(request == null ? null : request.eventId()));
    }
    @PostMapping("/validate")
    @RepeatSubmit.Disabled
    @Inner(allowedServices = "cloudflow-service-crm")
    public R<Void> validateSelection(@RequestBody Selection request) {
        commissions.validateSelection(request);
        return R.ok();
    }
}
