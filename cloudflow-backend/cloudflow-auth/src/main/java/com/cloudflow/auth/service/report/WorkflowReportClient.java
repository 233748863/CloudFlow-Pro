package com.cloudflow.auth.service.report;

import org.springframework.cloud.openfeign.FeignClient;

@FeignClient(name = "cloudflow-service-workflow", contextId = "reportWorkflow", path = "/inner/workflow/report", configuration = ReportFeignConfiguration.class)
public interface WorkflowReportClient extends ReportRemoteApi { }
