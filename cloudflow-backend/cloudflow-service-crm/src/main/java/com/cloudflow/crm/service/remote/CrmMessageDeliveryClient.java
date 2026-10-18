package com.cloudflow.crm.service.remote;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.message.api.MessageDeliverySnapshot;
import com.cloudflow.common.message.api.MessageEmailTemplate;
import com.cloudflow.common.message.api.MessageEmailTemplateChoice;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

@FeignClient(name = "cloudflow-auth", path = "/inner/auth/message", contextId = "crmMessageDelivery")
public interface CrmMessageDeliveryClient {
    @GetMapping("/crm-templates")
    R<java.util.List<MessageEmailTemplateChoice>> templates();

    @GetMapping("/crm-template")
    R<MessageEmailTemplate> template(@RequestParam("templateCode") String templateCode);

    @GetMapping("/crm-delivery/{recordId}")
    R<MessageDeliverySnapshot> snapshot(@PathVariable("recordId") Long recordId);
}
