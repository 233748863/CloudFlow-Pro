package com.cloudflow.auth.service.report;

import org.springframework.cloud.openfeign.FeignClient;

@FeignClient(name = "cloudflow-service-hr", contextId = "reportHr", path = "/inner/hr/report", configuration = ReportFeignConfiguration.class)
public interface HrReportClient extends ReportRemoteApi { }
