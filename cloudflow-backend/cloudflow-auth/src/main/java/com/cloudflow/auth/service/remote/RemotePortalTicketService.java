package com.cloudflow.auth.service.remote;

import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.PortalTicketFile;
import com.cloudflow.common.core.domain.PortalTicketRequest;
import com.cloudflow.common.core.domain.PortalTicketVO;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.security.portal.PortalTokens;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;

@FeignClient(name = "cloudflow-service-crm", path = "/inner/crm/portal/ticket", contextId = "portalTickets")
public interface RemotePortalTicketService {
    @GetMapping("/list")
    R<PageResult<PortalTicketVO>> list(@RequestHeader(PortalTokens.HEADER) String token,
            @RequestParam("keyword") String keyword, @RequestParam("status") String status,
            @RequestParam("pageNum") int pageNum, @RequestParam("pageSize") int pageSize);

    @GetMapping("/{id}")
    R<PortalTicketVO> detail(@RequestHeader(PortalTokens.HEADER) String token, @PathVariable("id") Long id);

    @GetMapping("/submission/{requestKey}")
    R<PortalTicketVO> submission(@RequestHeader(PortalTokens.HEADER) String token, @PathVariable("requestKey") String requestKey);

    @PostMapping
    R<PortalTicketVO> create(@RequestHeader(PortalTokens.HEADER) String token, @RequestBody PortalTicketRequest body);

    @GetMapping("/{id}/files/{fileId}")
    R<PortalTicketFile> file(@RequestHeader(PortalTokens.HEADER) String token,
            @PathVariable("id") Long id, @PathVariable("fileId") Long fileId);
}
