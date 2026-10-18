package com.cloudflow.crm.service.remote;

import feign.Response;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

@FeignClient(name = "cloudflow-auth", path = "/inner/auth/portal-ticket-files", contextId = "crmPortalTicketFiles")
public interface RemotePortalTicketFiles {
    @GetMapping("/{ticketId}/{fileId}/content")
    Response content(@PathVariable("ticketId") Long ticketId, @PathVariable("fileId") Long fileId);
}
