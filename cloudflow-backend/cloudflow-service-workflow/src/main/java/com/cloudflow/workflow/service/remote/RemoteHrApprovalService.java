package com.cloudflow.workflow.service.remote;

import com.cloudflow.common.core.constant.SecurityConstants;
import com.cloudflow.common.core.domain.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.List;
import java.util.Map;

@FeignClient(name = "cloudflow-service-hr", contextId = "workflowHrApproval", path = "/inner/hr")
public interface RemoteHrApprovalService {
    @GetMapping("/employees/approval-job-levels")
    R<List<Map<String, Object>>> listJobLevels(@RequestHeader(SecurityConstants.TENANT_ID_HEADER) Long tenantId,
                                              @RequestParam("userIds") List<Long> userIds);
}
