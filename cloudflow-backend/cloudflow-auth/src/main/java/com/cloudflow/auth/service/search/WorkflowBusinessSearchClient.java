package com.cloudflow.auth.service.search;

import org.springframework.cloud.openfeign.FeignClient;

@FeignClient(name = "cloudflow-service-workflow", contextId = "businessSearchWorkflow", path = "/inner/workflow", configuration = BusinessSearchFeignConfiguration.class)
public interface WorkflowBusinessSearchClient extends BusinessSearchRemoteApi { }
