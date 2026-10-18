package com.cloudflow.common.job.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.job.model.JobAcceptVO;
import com.cloudflow.common.job.model.JobExecuteDTO;
import com.cloudflow.common.job.model.JobStatusVO;
import com.cloudflow.common.job.service.JobExecutionService;
import com.cloudflow.common.security.annotation.Inner;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/job")
@RequiredArgsConstructor
@ConditionalOnProperty(name = "cloudflow.job.service-endpoints", havingValue = "true", matchIfMissing = true)
public class JobExecutionController {
    private final JobExecutionService executionService;

    @Inner(allowedServices = "cloudflow-auth")
    @PostMapping("/execute")
    public R<JobAcceptVO> execute(@RequestBody JobExecuteDTO request) {
        return executionService.execute(request);
    }

    @Inner(allowedServices = "cloudflow-auth")
    @GetMapping("/status/{executeNo}")
    public R<JobStatusVO> status(@PathVariable String executeNo) {
        return executionService.status(executeNo);
    }
}
