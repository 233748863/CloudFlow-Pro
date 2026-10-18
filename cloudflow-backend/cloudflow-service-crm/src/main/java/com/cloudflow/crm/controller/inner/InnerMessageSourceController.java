package com.cloudflow.crm.controller.inner;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.message.api.MessageSourceCheck;
import com.cloudflow.common.message.api.MessageSourceResult;
import com.cloudflow.common.message.api.MessageAttachment;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.crm.service.email.CrmEmailMessageSourceService;
import com.cloudflow.crm.service.email.archive.CrmEmailArchiveService;
import com.cloudflow.crm.service.email.archive.CrmEmailArchiveSource;
import com.cloudflow.crm.service.opportunity.CrmOpportunityReminderService;
import com.cloudflow.crm.service.impl.CrmActivityMessageSourceService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/crm/message")
@RequiredArgsConstructor
public class InnerMessageSourceController {
    private final CrmEmailMessageSourceService sources;
    private final CrmOpportunityReminderService opportunities;
    private final CrmEmailArchiveSource archive;
    private final CrmActivityMessageSourceService activities;

    @PostMapping("/verify")
    @Inner(allowedServices = "cloudflow-auth")
    @RepeatSubmit.Disabled
    @SysLog(value = "核实内部客户消息来源", logParams = false)
    public R<MessageSourceResult> verify(@RequestBody MessageSourceCheck request) {
        if (request != null && request.request() != null && CrmActivityMessageSourceService.BUSINESS_TYPE.equals(request.request().getBizType())) return R.ok(activities.verify(request));
        if (request != null && request.request() != null && CrmEmailArchiveService.BUSINESS_TYPE.equals(request.request().getBizType())) return R.ok(archive.verify(request));
        return R.ok(request != null && request.request() != null && CrmOpportunityReminderService.BUSINESS_TYPE.equals(request.request().getBizType())
                ? opportunities.verify(request) : sources.verify(request));
    }

    @PostMapping("/attachments")
    @Inner(allowedServices = "cloudflow-auth")
    @RepeatSubmit.Disabled
    @SysLog(value = "读取内部客户邮件私有附件", logParams = false)
    public R<java.util.List<MessageAttachment>> attachments(@RequestBody MessageSourceCheck request) { return R.ok(archive.attachments(request)); }
}
