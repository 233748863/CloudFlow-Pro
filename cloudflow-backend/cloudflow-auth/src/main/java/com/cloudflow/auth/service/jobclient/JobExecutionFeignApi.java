package com.cloudflow.auth.service.jobclient;

import com.cloudflow.common.core.constant.SecurityConstants;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.job.model.JobAcceptVO;
import com.cloudflow.common.job.model.JobExecuteDTO;
import com.cloudflow.common.job.model.JobStatusVO;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;

/** auth 集中调度到各服务的统一 Feign 协议。 */
public interface JobExecutionFeignApi {
    @PostMapping("/inner/job/execute")
    R<JobAcceptVO> execute(@RequestHeader(SecurityConstants.TENANT_ID_HEADER) String tenantId,
                           @RequestBody JobExecuteDTO request);

    @GetMapping("/inner/job/status/{executeNo}")
    R<JobStatusVO> status(@RequestHeader(SecurityConstants.TENANT_ID_HEADER) String tenantId,
                          @PathVariable("executeNo") String executeNo);
}
