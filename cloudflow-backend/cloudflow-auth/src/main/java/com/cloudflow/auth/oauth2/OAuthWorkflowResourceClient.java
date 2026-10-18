package com.cloudflow.auth.oauth2;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.security.oauth2.OAuthResources;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "cloudflow-service-workflow", contextId = "oauthWorkflowResources", path = "/inner/workflow/oauth2", configuration = OAuthResourceFeignConfiguration.class)
public interface OAuthWorkflowResourceClient {
    @PostMapping("/instance")
    R<OAuthResources.Instance> detail(@RequestBody OAuthResources.InstanceRequest request);
}

