package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
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

    private final ICrmNotificationService crmNotificationService;

    @SysLog("触发CRM通知扫描")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/dispatch")
    @SaCheckPermission("crm:notification:dispatch")
    public R<Integer> dispatch() {
        return R.ok(crmNotificationService.dispatchAll());
    }

    @SysLog("触发CRM跟进逾期通知")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/dispatch/follow-up")
    @SaCheckPermission("crm:notification:dispatch")
    public R<Integer> dispatchFollowUp() {
        return R.ok(crmNotificationService.dispatchFollowUpOverdue());
    }

    @SysLog("触发CRM回款到期通知")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/dispatch/receivable")
    @SaCheckPermission("crm:notification:dispatch")
    public R<Integer> dispatchReceivable() {
        return R.ok(crmNotificationService.dispatchReceivableDue());
    }

    @SysLog("触发CRM商机停滞通知")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/dispatch/opportunity")
    @SaCheckPermission("crm:notification:dispatch")
    public R<Integer> dispatchOpportunity() {
        return R.ok(crmNotificationService.dispatchStalledOpportunity());
    }
}
