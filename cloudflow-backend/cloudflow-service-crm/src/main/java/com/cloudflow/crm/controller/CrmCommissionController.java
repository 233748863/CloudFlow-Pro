package com.cloudflow.crm.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.service.deal.CrmCommissionService;
import com.cloudflow.crm.service.deal.CrmCommissionService.Confirmation;
import com.cloudflow.crm.service.deal.CrmCommissionService.Options;
import com.cloudflow.crm.service.deal.CrmCommissionService.Posting;
import com.cloudflow.crm.service.deal.CrmCommissionService.PostResult;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/commission")
@RequiredArgsConstructor
public class CrmCommissionController {
    private final CrmCommissionService commissions;
    @GetMapping("/options")
    @SaCheckPermission("crm:commission:manage")
    public R<Options> options() { return R.ok(commissions.options()); }
    @PostMapping("/confirm")
    @RepeatSubmit
    @SysLog(value = "核定到账销售提成", logParams = false)
    @SaCheckPermission("crm:commission:manage")
    public R<Void> confirm(@RequestBody Confirmation request) { commissions.confirm(request); return R.ok(); }
    @PostMapping("/post")
    @RepeatSubmit
    @SysLog(value = "传送已核定销售提成", logParams = false)
    @SaCheckPermission("crm:commission:manage")
    public R<PostResult> post(@RequestBody Posting request) { return R.ok(commissions.post(request)); }
}
