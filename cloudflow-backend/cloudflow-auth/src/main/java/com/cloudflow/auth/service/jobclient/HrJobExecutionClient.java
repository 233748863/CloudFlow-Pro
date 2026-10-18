package com.cloudflow.auth.service.jobclient;

import org.springframework.cloud.openfeign.FeignClient;

@FeignClient(name = "cloudflow-service-hr", contextId = "jobHrExecution", configuration = JobFeignConfiguration.class)
public interface HrJobExecutionClient extends JobExecutionFeignApi {
}
