package com.cloudflow.crm.controller.inner;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.crm.service.impl.CrmPortalContactService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/inner/crm/portal")
public class CrmPortalContactController {
    private final CrmPortalContactService service;
    private final ObjectMapper json;

    @Inner(allowedServices = "cloudflow-auth")
    @GetMapping("/visible-contact-ids")
    public R<List<Long>> visibleContactIds() { return R.ok(service.visibleContactIds()); }

    @Inner(allowedServices = "cloudflow-auth")
    @GetMapping("/contacts")
    public R<JsonNode> contacts(@RequestParam(required = false) String keyword, PageQuery pageQuery) {
        return R.ok(MessagePayloadCodec.internalTree(service.candidates(keyword, pageQuery), json));
    }

    @Inner(allowedServices = "cloudflow-auth")
    @GetMapping("/contacts/{id}/invitation")
    public R<JsonNode> invitation(@PathVariable("id") Long id,
            @RequestParam(defaultValue = "true") boolean requireActive) {
        return R.ok(MessagePayloadCodec.internalTree(service.invitation(id, requireActive), json));
    }

    @Inner(allowedServices = "cloudflow-auth")
    @GetMapping("/contacts/{id}/identity")
    public R<JsonNode> identity(@PathVariable("id") Long id, @RequestParam Long customerId) {
        return R.ok(MessagePayloadCodec.internalTree(service.identity(id, customerId), json));
    }
}
