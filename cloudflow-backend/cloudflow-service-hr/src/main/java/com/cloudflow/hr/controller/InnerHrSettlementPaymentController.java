package com.cloudflow.hr.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.hr.service.HrSettlementFundsService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/hr/settlement")
@RequiredArgsConstructor
public class InnerHrSettlementPaymentController {
    private final HrSettlementFundsService funds;

    @PostMapping("/payment-event")
    @Inner(allowedServices = "cloudflow-service-oa")
    @RepeatSubmit.Disabled
    public R<Void> paid(@RequestBody HrSettlementFundsService.Paid input) {
        funds.paid(input);
        return R.ok();
    }
}
