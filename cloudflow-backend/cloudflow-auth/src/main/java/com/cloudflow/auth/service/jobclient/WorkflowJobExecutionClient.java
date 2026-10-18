package com.cloudflow.auth.service.jobclient;

import org.springframework.cloud.openfeign.FeignClient;

@FeignClient(name = "cloudflow-service-workflow", contextId = "jobWorkflowExecution", configuration = JobFeignConfiguration.class)
public interface WorkflowJobExecutionClient extends JobExecutionFeignApi {
}
