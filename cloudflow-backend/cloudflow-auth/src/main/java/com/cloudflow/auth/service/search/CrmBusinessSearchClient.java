package com.cloudflow.auth.service.search;

import org.springframework.cloud.openfeign.FeignClient;

@FeignClient(name = "cloudflow-service-crm", contextId = "businessSearchCrm", path = "/inner/crm", configuration = BusinessSearchFeignConfiguration.class)
public interface CrmBusinessSearchClient extends BusinessSearchRemoteApi { }
