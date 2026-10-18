package com.cloudflow.auth.service.report;

import org.springframework.cloud.openfeign.FeignClient;

@FeignClient(name = "cloudflow-service-oa", contextId = "reportOa", path = "/inner/oa/report", configuration = ReportFeignConfiguration.class)
public interface OaReportClient extends ReportRemoteApi { }
