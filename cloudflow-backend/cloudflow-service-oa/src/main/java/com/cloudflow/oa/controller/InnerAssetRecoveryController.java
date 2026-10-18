package com.cloudflow.oa.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.oa.domain.vo.OaEmployeeAssetRecovery;
import com.cloudflow.oa.service.impl.OaEmployeeAssetRecoveryService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/oa/asset")
@RequiredArgsConstructor
public class InnerAssetRecoveryController {
    private final OaEmployeeAssetRecoveryService service;
    private final com.cloudflow.oa.service.impl.OaAssetReturnReminderService reminders;

    @GetMapping("/return-reminder")
    @Inner(allowedServices = "cloudflow-service-hr")
    public R<com.cloudflow.oa.domain.vo.OaAssetReturnReminder> reminder(@RequestParam Long employeeId, @RequestParam Long userId,
            @RequestParam Long settlementId, @RequestParam Long assetId) {
        return R.ok(reminders.inspect(employeeId, userId, settlementId, assetId));
    }

    @org.springframework.web.bind.annotation.PostMapping("/return-reminder")
    @Inner(allowedServices = "cloudflow-service-hr")
    @com.cloudflow.common.idempotent.annotation.RepeatSubmit.Disabled
    @com.cloudflow.common.log.annotation.SysLog(value = "发送离职资产归还提醒", logParams = false)
    public R<com.cloudflow.oa.domain.vo.OaAssetReturnReminder> sendReminder(
            @jakarta.validation.Valid @org.springframework.web.bind.annotation.RequestBody com.cloudflow.oa.domain.dto.OaAssetReturnReminderRequest input) {
        return R.ok(reminders.send(input));
    }

    @GetMapping("/employee-recovery")
    @Inner(allowedServices = "cloudflow-service-hr")
    public R<OaEmployeeAssetRecovery> outstanding(@RequestParam Long employeeId) {
        return R.ok(service.outstanding(employeeId));
    }
}
