package com.cloudflow.auth.service.search;

import org.springframework.cloud.openfeign.FeignClient;

@FeignClient(name = "cloudflow-service-oa", contextId = "businessSearchOa", path = "/inner/oa", configuration = BusinessSearchFeignConfiguration.class)
public interface OaBusinessSearchClient extends BusinessSearchRemoteApi { }
