package com.cloudflow.oa.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.oa.service.OaHrPaymentService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/oa/payment")
@RequiredArgsConstructor
public class InnerHrPaymentController {
    private final OaHrPaymentService service;
    @PostMapping("/hr-source")
    @Inner(allowedServices = "cloudflow-service-hr")
    @RepeatSubmit.Disabled
    public R<Long> create(@RequestBody Source input) { return R.ok(service.create(input.sourceType(), input.sourceId())); }
    public record Source(String sourceType, Long sourceId) { }
}
