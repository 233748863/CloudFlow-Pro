package com.cloudflow.auth.service.jobclient;

import org.springframework.cloud.openfeign.FeignClient;

@FeignClient(name = "cloudflow-service-crm", contextId = "jobCrmExecution", configuration = JobFeignConfiguration.class)
public interface CrmJobExecutionClient extends JobExecutionFeignApi {
}
