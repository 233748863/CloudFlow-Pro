package com.cloudflow.oa.service.remote;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.message.api.MessageChannelReadiness;
import com.cloudflow.common.message.api.MessageDeliverySnapshot;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

@FeignClient(name = "cloudflow-auth", path = "/inner/auth/message", contextId = "oaMessageDelivery")
public interface RemoteMessageDeliveryService {
    @GetMapping("/email-readiness")
    R<MessageChannelReadiness> readiness(@RequestParam("templateCode") String templateCode);

    @GetMapping("/oa-delivery/{recordId}")
    R<MessageDeliverySnapshot> snapshot(@PathVariable("recordId") Long recordId);
}
