package com.cloudflow.auth.service.remote;

import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.PortalContractVO;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.security.portal.PortalTokens;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;

@FeignClient(name = "cloudflow-service-oa", path = "/inner/oa/portal/contract", contextId = "portalContract")
public interface RemotePortalContractService {
    @GetMapping("/list")
    R<PageResult<PortalContractVO>> list(@RequestHeader(PortalTokens.HEADER) String token,
            @RequestParam("keyword") String keyword, @RequestParam("pageNum") int pageNum, @RequestParam("pageSize") int pageSize);

    @GetMapping("/{id}")
    R<PortalContractVO> detail(@RequestHeader(PortalTokens.HEADER) String token, @PathVariable("id") Long id);
}
