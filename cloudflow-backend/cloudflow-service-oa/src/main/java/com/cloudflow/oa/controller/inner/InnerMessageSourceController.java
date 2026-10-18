package com.cloudflow.oa.controller.inner;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.message.api.MessageAttachment;
import com.cloudflow.common.message.api.MessageSourceCheck;
import com.cloudflow.common.message.api.MessageSourceResult;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.oa.service.impl.OaRfqMessageSourceService;
import com.cloudflow.oa.service.impl.OaMeetingReminderService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/oa/message")
@RequiredArgsConstructor
public class InnerMessageSourceController {
    private final OaRfqMessageSourceService sources;
    private final OaMeetingReminderService meetings;

    @PostMapping("/verify")
    @Inner(allowedServices = "cloudflow-auth")
    @RepeatSubmit.Disabled
    @SysLog(value = "核实内部邮件业务来源", logParams = false)
    public R<MessageSourceResult> verify(@RequestBody MessageSourceCheck request) {
        return R.ok(request != null && request.request() != null && OaMeetingReminderService.BUSINESS_TYPE.equals(request.request().getBizType())
                ? meetings.verify(request) : sources.verify(request));
    }

    @PostMapping("/attachments")
    @Inner(allowedServices = "cloudflow-auth")
    @RepeatSubmit.Disabled
    @SysLog(value = "读取内部邮件私有附件", logParams = false)
    public R<List<MessageAttachment>> attachments(@RequestBody MessageSourceCheck request) { return R.ok(sources.attachments(request)); }
}
