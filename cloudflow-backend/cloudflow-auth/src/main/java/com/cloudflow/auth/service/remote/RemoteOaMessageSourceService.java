package com.cloudflow.auth.service.remote;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.message.api.MessageAttachment;
import com.cloudflow.common.message.api.MessageSourceResult;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "cloudflow-service-oa", path = "/inner/oa/message", contextId = "oaMessageSource")
public interface RemoteOaMessageSourceService {
    @PostMapping("/verify")
    R<MessageSourceResult> verify(@RequestBody JsonNode request);

    @PostMapping("/attachments")
    R<List<MessageAttachment>> attachments(@RequestBody JsonNode request);
}
