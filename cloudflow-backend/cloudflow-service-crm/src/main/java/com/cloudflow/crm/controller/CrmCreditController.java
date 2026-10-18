package com.cloudflow.crm.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.CrmCustomerCredit;
import com.cloudflow.crm.service.impl.CrmCreditService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/credit")
@RequiredArgsConstructor
public class CrmCreditController {
    private final CrmCreditService service;

    @GetMapping("/customer/{customerId}")
    @SaCheckPermission("crm:credit:query")
    public R<Map<String, Object>> detail(@PathVariable Long customerId) { return R.ok(service.view(customerId)); }

    @SysLog("提交客户额度审批")
    @PostMapping("/customer/{customerId}/submit")
    @SaCheckPermission("crm:credit:edit")
    @RepeatSubmit
    public R<Long> submit(@PathVariable Long customerId, @RequestBody CrmCustomerCredit request) { return R.ok(service.submit(customerId, request)); }

    @SysLog("设置客户额度例外放行")
    @PostMapping("/customer/{customerId}/bypass")
    @SaCheckPermission("crm:credit:bypass")
    @RepeatSubmit
    public R<Void> bypass(@PathVariable Long customerId, @RequestBody CrmCustomerCredit request) { service.bypass(customerId, request); return R.ok(); }
}
