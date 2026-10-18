package com.cloudflow.auth.controller.inner;

import com.cloudflow.auth.oauth2.OAuthAccessService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.common.security.oauth2.OAuthIdentity;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/auth/oauth2")
@RequiredArgsConstructor
public class OAuthVerificationController {
    private final OAuthAccessService service;

    @PostMapping("/verify")
    @Inner(allowedServices = {"cloudflow-gateway", "cloudflow-service-crm", "cloudflow-service-workflow"})
    @SysLog(value = "核验第三方令牌有效性", logParams = false)
    public R<OAuthIdentity> verify(@RequestBody Verification request) {
        try {
            OAuthIdentity identity = service.verifyHash(request.tokenHash());
            if (request.scope() != null && !identity.scopes().contains(com.cloudflow.common.security.oauth2.OAuthScope.require(request.scope()).code())) {
                throw com.cloudflow.common.security.oauth2.OAuthFailure.forbidden();
            }
            return R.ok(identity);
        } catch (com.cloudflow.common.security.oauth2.OAuthFailure failure) {
            service.recordAccess(null, failure.getCode());
            throw failure;
        }
    }

    public record Verification(String tokenHash, String scope) {
        @Override public String toString() { return "OAuthVerification[REDACTED]"; }
    }
}
