package com.cloudflow.crm.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.CrmLead;
import com.cloudflow.crm.service.impl.CrmLeadQualificationService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
public class CrmLeadQualificationController {
    private final CrmLeadQualificationService service;
    @Data
    public static class Action { private Integer version; private String comment; private String disqualifyReason; private Integer unsubscribeFlag; }
    @SysLog("判定线索合格")
    @PostMapping("/lead/{id}/qualify")
    @RepeatSubmit
    @SaCheckPermission("crm:lead:qualify")
    public R<CrmLead> qualify(@PathVariable Long id, @RequestBody Action request) { return R.ok(service.qualify(id, "QUALIFIED", request.getComment(), request.getVersion())); }
    @SysLog("判定线索不合格")
    @PostMapping("/lead/{id}/disqualify")
    @RepeatSubmit
    @SaCheckPermission("crm:lead:qualify")
    public R<CrmLead> disqualify(@PathVariable Long id, @RequestBody Action request) { return R.ok(service.qualify(id, "DISQUALIFIED", request.getDisqualifyReason(), request.getVersion())); }
    @SysLog("开始线索资质评估")
    @PostMapping("/lead/{id}/start-qualifying")
    @RepeatSubmit
    @SaCheckPermission("crm:lead:qualify")
    public R<CrmLead> startQualifying(@PathVariable Long id, @RequestBody Action request) { return R.ok(service.qualify(id, "QUALIFYING", request.getComment(), request.getVersion())); }
    @SysLog("设置线索退订状态")
    @PostMapping("/lead/{id}/unsubscribe")
    @RepeatSubmit
    @SaCheckPermission("crm:lead:edit")
    public R<Void> unsubscribeLead(@PathVariable Long id, @RequestBody Action request) { service.unsubscribeLead(id, request.getUnsubscribeFlag(), request.getVersion()); return R.ok(); }
    @SysLog("设置客户退订状态")
    @PostMapping("/customer/{id}/unsubscribe")
    @RepeatSubmit
    @SaCheckPermission("crm:customer:edit")
    public R<Void> unsubscribeCustomer(@PathVariable Long id, @RequestBody Action request) { service.unsubscribeCustomer(id, request.getUnsubscribeFlag(), request.getVersion()); return R.ok(); }
}
