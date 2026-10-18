package com.cloudflow.auth.controller.inner;

import com.cloudflow.auth.service.ISysFileService;
import com.cloudflow.common.security.annotation.Inner;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/auth/portal-ticket-files")
@RequiredArgsConstructor
public class InnerPortalTicketFileController {
    private final ISysFileService files;

    @GetMapping("/{ticketId}/{fileId}/content")
    @Inner(allowedServices = "cloudflow-service-crm")
    public void content(@PathVariable Long ticketId, @PathVariable Long fileId, HttpServletResponse response) {
        files.copyPortalTicketFile(ticketId, fileId, response);
    }
}
