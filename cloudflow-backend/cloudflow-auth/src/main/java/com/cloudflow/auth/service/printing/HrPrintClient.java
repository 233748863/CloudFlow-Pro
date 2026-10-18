package com.cloudflow.auth.service.printing;

import com.cloudflow.auth.service.report.ReportFeignConfiguration;
import org.springframework.cloud.openfeign.FeignClient;

@FeignClient(name = "cloudflow-service-hr", contextId = "printHr", path = "/inner/hr/print", configuration = ReportFeignConfiguration.class)
public interface HrPrintClient extends PrintRemoteApi { }
