package com.cloudflow.auth.controller;

import com.cloudflow.auth.service.HrAdvanceRuleBridgeService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.security.annotation.Inner;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/auth/hr-advance-rules")
@RequiredArgsConstructor
public class HrAdvanceRuleInnerController {
    private final HrAdvanceRuleBridgeService service;

    @GetMapping
    @Inner(allowedServices = "cloudflow-service-hr")
    public R<List<HrAdvanceRuleBridgeService.PublishedRule>> policy(@RequestParam boolean payrollDeduction) {
        return R.ok(service.policy(payrollDeduction));
    }
}
