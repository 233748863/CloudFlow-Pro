package com.cloudflow.auth.controller;

import com.cloudflow.auth.domain.BusinessRule;
import com.cloudflow.auth.domain.BusinessRuleHitRecord;
import com.cloudflow.auth.service.ProjectRuleBridgeService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.security.annotation.Inner;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/auth/oa-project-rules")
@RequiredArgsConstructor
public class ProjectRuleInnerController {
    private final ProjectRuleBridgeService service;

    @GetMapping("/effective/{ruleCode}")
    @Inner(allowedServices = "cloudflow-service-oa")
    public R<BusinessRule> effective(@PathVariable String ruleCode) {
        return R.ok(service.effective(ruleCode));
    }

    @PostMapping("/hit-records")
    @RepeatSubmit.Disabled
    @Inner(allowedServices = "cloudflow-service-oa")
    public R<Void> recordHit(@RequestBody BusinessRuleHitRecord record) {
        service.record(record);
        return R.ok();
    }
}
