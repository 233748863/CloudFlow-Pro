package com.cloudflow.oa.controller.inner;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.oa.service.impl.OaFinancePublicationService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/inner/oa/finance-publication")
@RequiredArgsConstructor
public class FinancePublicationScopeController {
    private final OaFinancePublicationService publication;

    @Inner(allowedServices = "cloudflow-auth")
    @GetMapping("/{id}/upload-scope")
    public R<Long> uploadScope(@PathVariable Long id) { return R.ok(publication.uploadScope(id)); }
}
