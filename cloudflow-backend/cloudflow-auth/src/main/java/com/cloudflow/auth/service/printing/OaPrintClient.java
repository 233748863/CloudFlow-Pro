package com.cloudflow.auth.service.printing;

import com.cloudflow.auth.service.report.ReportFeignConfiguration;
import org.springframework.cloud.openfeign.FeignClient;

@FeignClient(name = "cloudflow-service-oa", contextId = "printOa", path = "/inner/oa/print", configuration = ReportFeignConfiguration.class)
public interface OaPrintClient extends PrintRemoteApi { }
