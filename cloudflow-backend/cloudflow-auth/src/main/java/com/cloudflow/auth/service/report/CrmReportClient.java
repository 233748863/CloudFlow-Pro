package com.cloudflow.auth.service.report;

import org.springframework.cloud.openfeign.FeignClient;

@FeignClient(name = "cloudflow-service-crm", contextId = "reportCrm", path = "/inner/crm/report", configuration = ReportFeignConfiguration.class)
public interface CrmReportClient extends ReportRemoteApi { }
