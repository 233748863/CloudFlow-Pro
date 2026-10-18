package com.cloudflow.auth.service.jobclient;

import org.springframework.cloud.openfeign.FeignClient;

@FeignClient(name = "cloudflow-auth", contextId = "jobAuthExecution", configuration = JobFeignConfiguration.class)
public interface AuthJobExecutionClient extends JobExecutionFeignApi {
}
