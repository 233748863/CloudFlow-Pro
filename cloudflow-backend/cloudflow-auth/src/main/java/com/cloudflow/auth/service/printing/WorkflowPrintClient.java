package com.cloudflow.auth.service.printing;

import com.cloudflow.auth.service.report.ReportFeignConfiguration;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.printing.PrintData;
import java.util.Map;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "cloudflow-service-workflow", contextId = "printWorkflow", path = "/inner/workflow/print", configuration = ReportFeignConfiguration.class)
public interface WorkflowPrintClient {
    @PostMapping("/filter")
    R<Map<String, Object>> filter(@RequestBody PrintData data);
}
