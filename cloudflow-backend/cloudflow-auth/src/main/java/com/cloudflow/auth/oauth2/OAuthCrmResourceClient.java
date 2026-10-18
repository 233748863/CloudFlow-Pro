package com.cloudflow.auth.oauth2;

import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.security.oauth2.OAuthResources;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "cloudflow-service-crm", contextId = "oauthCrmResources", path = "/inner/crm/oauth2", configuration = OAuthResourceFeignConfiguration.class)
public interface OAuthCrmResourceClient {
    @PostMapping("/customers/query")
    R<PageResult<OAuthResources.Customer>> query(@RequestBody OAuthResources.CustomerQuery request);
    @PostMapping("/customer")
    R<OAuthResources.Customer> detail(@RequestBody OAuthResources.CustomerRequest request);
}

