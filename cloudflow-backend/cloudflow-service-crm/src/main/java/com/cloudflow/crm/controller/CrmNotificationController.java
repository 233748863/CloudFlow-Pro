package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.service.ICrmNotificationService;
import lombok.RequiredArgsConstructor;
import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/notification")
@SaCheckLogin
@RequiredArgsConstructor
public class CrmNotificationController {

    private final ICrmNotificationService notificationService;

    @SysLog("触发CRM通知扫描")
    @PostMapping("/dispatch")
    @SaCheckPermission("crm:notification:dispatch")
    public R<Integer> dispatch() {
        return R.ok(notificationService.dispatchAll());
    }

    @SysLog("触发CRM跟进逾期通知")
    @PostMapping("/dispatch/follow-up")
    @SaCheckPermission("crm:notification:dispatch")
    public R<Integer> dispatchFollowUp() {
        return R.ok(notificationService.dispatchFollowUpOverdue());
    }

    @SysLog("触发CRM回款到期通知")
    @PostMapping("/dispatch/receivable")
    @SaCheckPermission("crm:notification:dispatch")
    public R<Integer> dispatchReceivable() {
        return R.ok(notificationService.dispatchReceivableDue());
    }

    @SysLog("触发CRM商机停滞通知")
    @PostMapping("/dispatch/opportunity")
    @SaCheckPermission("crm:notification:dispatch")
    public R<Integer> dispatchOpportunity() {
        return R.ok(notificationService.dispatchStalledOpportunity());
    }
}
