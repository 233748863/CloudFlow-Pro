package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.service.ICrmNotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/notification")
@RequiredArgsConstructor
public class CrmNotificationController {

    private final ICrmNotificationService notificationService;

    @SysLog("触发CRM通知扫描")
    @PostMapping("/dispatch")
    public R<Integer> dispatch() {
        return R.ok(notificationService.dispatchAll());
    }

    @SysLog("触发CRM跟进逾期通知")
    @PostMapping("/dispatch/follow-up")
    public R<Integer> dispatchFollowUp() {
        return R.ok(notificationService.dispatchFollowUpOverdue());
    }

    @SysLog("触发CRM回款到期通知")
    @PostMapping("/dispatch/receivable")
    public R<Integer> dispatchReceivable() {
        return R.ok(notificationService.dispatchReceivableDue());
    }

    @SysLog("触发CRM商机停滞通知")
    @PostMapping("/dispatch/opportunity")
    public R<Integer> dispatchOpportunity() {
        return R.ok(notificationService.dispatchStalledOpportunity());
    }
}
