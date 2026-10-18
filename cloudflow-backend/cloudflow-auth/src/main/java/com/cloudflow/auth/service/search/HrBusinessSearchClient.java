package com.cloudflow.auth.service.search;

import org.springframework.cloud.openfeign.FeignClient;

@FeignClient(name = "cloudflow-service-hr", contextId = "businessSearchHr", path = "/inner/hr", configuration = BusinessSearchFeignConfiguration.class)
public interface HrBusinessSearchClient extends BusinessSearchRemoteApi { }
