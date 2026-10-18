package com.cloudflow.crm.controller.inner;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.message.api.MessageDeliveryResult;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.crm.service.email.archive.CrmEmailArchiveSource;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/crm/email")
@RequiredArgsConstructor
public class CrmEmailDeliveryController {
    private final CrmEmailArchiveSource source;

    @PostMapping("/delivery-event")
    @Inner(allowedServices = "cloudflow-auth")
    @RepeatSubmit.Disabled
    @SysLog(value = "回写客户邮件真实投递状态", logParams = false)
    public R<Void> deliveryEvent(@RequestBody MessageDeliveryResult result) { source.delivery(result); return R.ok(); }
}
