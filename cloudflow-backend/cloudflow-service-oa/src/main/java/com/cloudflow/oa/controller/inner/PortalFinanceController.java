package com.cloudflow.oa.controller.inner;

import com.cloudflow.common.core.domain.*;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.common.security.portal.PortalTokens;
import com.cloudflow.oa.service.impl.PortalFinanceService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/inner/oa/portal/finance")
@RequiredArgsConstructor
public class PortalFinanceController {
    private final PortalFinanceService finance;

    @Inner(allowedServices = "cloudflow-auth")
    @GetMapping("/list")
    public R<PageResult<PortalFinanceVO>> list(@RequestHeader(PortalTokens.HEADER) String token,
            @RequestParam(required = false) String keyword, @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "10") int pageSize) {
        return R.ok(finance.list(token, keyword, pageNum, pageSize));
    }

    @Inner(allowedServices = "cloudflow-auth")
    @GetMapping("/{id}")
    public R<PortalFinanceVO> detail(@RequestHeader(PortalTokens.HEADER) String token, @PathVariable Long id) {
        return R.ok(finance.detail(token, id));
    }

    @Inner(allowedServices = "cloudflow-auth")
    @GetMapping("/{id}/files/{fileId}")
    public R<PortalFinanceFile> file(@RequestHeader(PortalTokens.HEADER) String token, @PathVariable Long id, @PathVariable Long fileId) {
        return R.ok(finance.file(token, id, fileId));
    }
}
