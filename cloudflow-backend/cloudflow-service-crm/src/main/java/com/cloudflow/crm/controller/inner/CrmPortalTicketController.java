package com.cloudflow.crm.controller.inner;

import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.PortalTicketFile;
import com.cloudflow.common.core.domain.PortalTicketRequest;
import com.cloudflow.common.core.domain.PortalTicketVO;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.common.security.portal.PortalTokens;
import com.cloudflow.crm.service.impl.CrmPortalTicketService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/inner/crm/portal/ticket")
public class CrmPortalTicketController {
    private final CrmPortalTicketService tickets;

    @GetMapping("/list")
    @Inner(allowedServices = "cloudflow-auth")
    public R<PageResult<PortalTicketVO>> list(@RequestHeader(PortalTokens.HEADER) String token,
            @RequestParam(required = false) String keyword, @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") int pageNum, @RequestParam(defaultValue = "10") int pageSize) {
        return R.ok(tickets.list(token, keyword, status, pageNum, pageSize));
    }

    @GetMapping("/{id}")
    @Inner(allowedServices = "cloudflow-auth")
    public R<PortalTicketVO> detail(@RequestHeader(PortalTokens.HEADER) String token, @PathVariable Long id) {
        return R.ok(tickets.detail(token, id));
    }

    @GetMapping("/submission/{requestKey}")
    @Inner(allowedServices = "cloudflow-auth")
    public R<PortalTicketVO> submission(@RequestHeader(PortalTokens.HEADER) String token, @PathVariable String requestKey) {
        return R.ok(tickets.submission(token, requestKey));
    }

    @PostMapping
    @Inner(allowedServices = "cloudflow-auth")
    @RepeatSubmit.Disabled
    public R<PortalTicketVO> create(@RequestHeader(PortalTokens.HEADER) String token, @Valid @RequestBody PortalTicketRequest body) {
        return R.ok(tickets.create(token, body));
    }

    @GetMapping("/{id}/files/{fileId}")
    @Inner(allowedServices = "cloudflow-auth")
    public R<PortalTicketFile> file(@RequestHeader(PortalTokens.HEADER) String token, @PathVariable Long id, @PathVariable Long fileId) {
        return R.ok(tickets.file(token, id, fileId));
    }
}
