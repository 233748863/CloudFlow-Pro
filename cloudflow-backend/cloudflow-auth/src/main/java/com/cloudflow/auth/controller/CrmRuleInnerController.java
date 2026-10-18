package com.cloudflow.auth.controller;

import com.cloudflow.auth.domain.BusinessRule;
import com.cloudflow.auth.domain.BusinessRuleHitRecord;
import com.cloudflow.auth.service.CrmRuleBridgeService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.security.annotation.Inner;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/inner/auth/crm-rules")
@RequiredArgsConstructor
public class CrmRuleInnerController {
    private final CrmRuleBridgeService service;

    @GetMapping("/effective/{code}")
    @Inner(allowedServices = "cloudflow-service-crm")
    public R<BusinessRule> effective(@PathVariable String code) { return R.ok(service.effective(code)); }

    @PostMapping("/hit-records")
    @RepeatSubmit.Disabled
    @Inner(allowedServices = "cloudflow-service-crm")
    public R<Void> recordHit(@RequestBody BusinessRuleHitRecord record) { service.record(record); return R.ok(); }
}
