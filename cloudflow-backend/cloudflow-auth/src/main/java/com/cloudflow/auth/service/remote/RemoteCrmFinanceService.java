package com.cloudflow.auth.service.remote;

import com.cloudflow.common.core.domain.*;
import com.cloudflow.common.security.portal.PortalTokens;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.*;

@FeignClient(name = "cloudflow-service-crm", contextId = "portalCrmFinance")
public interface RemoteCrmFinanceService {
    @GetMapping("/inner/crm/portal/finance/list")
    R<PageResult<PortalFinanceVO>> list(@RequestHeader(PortalTokens.HEADER) String token, @RequestParam("keyword") String keyword,
            @RequestParam("pageNum") int pageNum, @RequestParam("pageSize") int pageSize);

    @GetMapping("/inner/crm/portal/finance/{id}")
    R<PortalFinanceVO> detail(@RequestHeader(PortalTokens.HEADER) String token, @PathVariable("id") Long id);

    @GetMapping("/inner/crm/portal/finance/{id}/files/{fileId}")
    R<PortalFinanceFile> file(@RequestHeader(PortalTokens.HEADER) String token, @PathVariable("id") Long id, @PathVariable("fileId") Long fileId);

    @GetMapping("/inner/crm/finance-publication/{id}/upload-scope")
    R<Long> uploadScope(@PathVariable("id") Long id);
}
