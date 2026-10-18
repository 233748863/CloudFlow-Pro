package com.cloudflow.auth.controller;

import com.cloudflow.auth.service.JobPlatformService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.constant.SecurityConstants;
import com.cloudflow.common.job.model.HandlerReportDTO;
import com.cloudflow.common.job.model.JobResultReportDTO;
import com.cloudflow.common.job.model.BusinessJobStartRequest;
import com.cloudflow.common.job.model.JobExecuteDTO;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/**
 * 业务服务回报入口。
 */
@RestController
@RequestMapping("/inner/job")
@RequiredArgsConstructor
public class JobInnerReportController {
    private final JobPlatformService service;

    @Inner(allowedServices = {"cloudflow-auth", "cloudflow-service-hr", "cloudflow-service-oa", "cloudflow-service-crm"})
    @RepeatSubmit.Disabled
    @PostMapping("/business/register")
    public R<JobExecuteDTO> registerBusinessJob(@RequestBody BusinessJobStartRequest request,
            @RequestHeader(SecurityConstants.FROM_SERVICE_HEADER) String sourceService) {
        return R.ok(service.registerBusinessJob(request, sourceService));
    }

    @Inner(allowedServices = {"cloudflow-auth", "cloudflow-service-workflow",
            "cloudflow-service-oa", "cloudflow-service-crm", "cloudflow-service-hr"})
    @RepeatSubmit.Disabled
    @PostMapping("/handler/report")
    public R<Void> reportHandlers(
            @RequestBody HandlerReportDTO dto,
            @RequestHeader(SecurityConstants.FROM_SERVICE_HEADER) String sourceService) {
        service.reportHandlers(dto, sourceService);
        return R.ok();
    }

    @Inner(allowedServices = {"cloudflow-auth", "cloudflow-service-workflow",
            "cloudflow-service-oa", "cloudflow-service-crm", "cloudflow-service-hr"})
    @RepeatSubmit.Disabled
    @PostMapping("/report")
    public R<Void> reportResult(
            @RequestBody JobResultReportDTO dto,
            @RequestHeader(SecurityConstants.FROM_SERVICE_HEADER) String sourceService) {
        service.reportResult(dto, sourceService);
        return R.ok();
    }
}
