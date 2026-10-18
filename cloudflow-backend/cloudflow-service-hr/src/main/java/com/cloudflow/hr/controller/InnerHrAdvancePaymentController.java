package com.cloudflow.hr.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.hr.service.HrAdvancePaymentService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/hr/advance")
@RequiredArgsConstructor
public class InnerHrAdvancePaymentController {
    private final HrAdvancePaymentService payments;
    @PostMapping("/payment-event")
    @Inner(allowedServices = "cloudflow-service-oa")
    @RepeatSubmit.Disabled
    public R<Void> paid(@RequestBody HrAdvancePaymentService.Paid input) { payments.paid(input); return R.ok(); }
}
