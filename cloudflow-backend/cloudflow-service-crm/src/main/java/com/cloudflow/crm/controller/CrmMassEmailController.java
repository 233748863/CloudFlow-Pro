package com.cloudflow.crm.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.CrmMassEmail;
import com.cloudflow.crm.domain.CrmMassEmailRecipient;
import com.cloudflow.crm.domain.dto.CrmMassEmailCommand;
import com.cloudflow.crm.domain.dto.CrmMassEmailDraft;
import com.cloudflow.crm.service.impl.CrmCampaignDeliveryService;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/campaign/mass-email")
@RequiredArgsConstructor
public class CrmMassEmailController {
    private final CrmCampaignDeliveryService service;

    @GetMapping("/templates")
    @SaCheckPermission("crm:campaign:send")
    public R<List<com.cloudflow.common.message.api.MessageEmailTemplateChoice>> templates() { return R.ok(service.templates()); }

    @GetMapping("/list")
    @SaCheckPermission("crm:campaign:list")
    public R<List<CrmMassEmail>> list(@RequestParam Long campaignId) { return R.ok(service.list(campaignId)); }

    @GetMapping("/{id}")
    @SaCheckPermission("crm:campaign:list")
    public R<Map<String, Object>> detail(@PathVariable Long id, PageQuery page) { return R.ok(service.detail(id, page)); }

    @PostMapping
    @SaCheckPermission("crm:campaign:send")
    @RepeatSubmit
    @SysLog(value = "保存营销邮件草稿", logParams = false)
    public R<CrmMassEmail> save(@RequestBody CrmMassEmailDraft request) { return R.ok(service.save(request)); }

    @PostMapping("/{id}/preview")
    @SaCheckPermission("crm:campaign:send")
    @RepeatSubmit.Disabled
    @SysLog(value = "预览营销邮件发送对象", logParams = false)
    public R<Map<String, Object>> preview(@PathVariable Long id) { return R.ok(service.preview(id)); }

    @PostMapping("/{id}/send")
    @SaCheckPermission("crm:campaign:send")
    @RepeatSubmit
    @SysLog(value = "提交营销邮件发送", logParams = false)
    public R<CrmMassEmail> send(@PathVariable Long id, @RequestBody CrmMassEmailCommand command) { return R.ok(service.send(id, command)); }

    @PostMapping("/{id}/schedule")
    @SaCheckPermission("crm:campaign:send")
    @RepeatSubmit
    @SysLog(value = "安排营销邮件发送时间", logParams = false)
    public R<CrmMassEmail> schedule(@PathVariable Long id, @RequestBody CrmMassEmailCommand command) { return R.ok(service.schedule(id, command)); }

    @PostMapping("/{id}/test")
    @SaCheckPermission("crm:campaign:send")
    @RepeatSubmit
    @SysLog(value = "发送指定邮箱测试邮件", logParams = false)
    public R<CrmMassEmailRecipient> test(@PathVariable Long id, @RequestBody CrmMassEmailCommand command) { return R.ok(service.test(id, command)); }

    @PostMapping("/{id}/cancel")
    @SaCheckPermission("crm:campaign:send")
    @RepeatSubmit
    @SysLog(value = "取消未发出的营销邮件", logParams = false)
    public R<CrmMassEmail> cancel(@PathVariable Long id, @RequestBody CrmMassEmailCommand command) { return R.ok(service.cancel(id, command)); }
}
