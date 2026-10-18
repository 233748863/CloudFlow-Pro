package com.cloudflow.auth.service.jobclient;

import org.springframework.cloud.openfeign.FeignClient;

@FeignClient(name = "cloudflow-service-oa", contextId = "jobOaExecution", configuration = JobFeignConfiguration.class)
public interface OaJobExecutionClient extends JobExecutionFeignApi {
}
