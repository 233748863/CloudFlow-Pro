package com.cloudflow.auth.service.remote;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.message.api.MessageSourceResult;
import com.cloudflow.common.message.api.MessageAttachment;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "cloudflow-service-crm", path = "/inner/crm/message", contextId = "crmMessageSource")
public interface RemoteCrmMessageSourceService {
    @PostMapping("/verify")
    R<MessageSourceResult> verify(@RequestBody JsonNode request);

    @PostMapping("/attachments")
    R<java.util.List<MessageAttachment>> attachments(@RequestBody JsonNode request);
}
