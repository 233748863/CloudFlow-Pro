package com.cloudflow.crm.service.remote;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.security.oauth2.OAuthIdentity;
import com.cloudflow.common.security.oauth2.OAuthResources;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "cloudflow-auth", contextId = "crmOAuthVerifier", path = "/inner/auth/oauth2",
        configuration = OAuthRemoteConfiguration.class)
public interface OAuthVerificationClient {
    @PostMapping("/verify")
    R<OAuthIdentity> verify(@RequestBody OAuthResources.Verification request);
}

