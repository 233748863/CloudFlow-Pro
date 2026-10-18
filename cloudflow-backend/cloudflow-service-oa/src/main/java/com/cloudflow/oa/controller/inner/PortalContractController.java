package com.cloudflow.oa.controller.inner;

import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.PortalContractVO;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.common.security.portal.PortalTokens;
import com.cloudflow.oa.service.impl.PortalContractService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/inner/oa/portal/contract")
public class PortalContractController {
    private final PortalContractService contracts;

    @Inner(allowedServices = "cloudflow-auth")
    @GetMapping("/list")
    public R<PageResult<PortalContractVO>> list(@RequestHeader(PortalTokens.HEADER) String token,
            @RequestParam(required = false) String keyword, @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "10") int pageSize) {
        return R.ok(contracts.list(token, keyword, pageNum, pageSize));
    }

    @Inner(allowedServices = "cloudflow-auth")
    @GetMapping("/{id}")
    public R<PortalContractVO> detail(@RequestHeader(PortalTokens.HEADER) String token, @PathVariable Long id) {
        return R.ok(contracts.detail(token, id));
    }
}
