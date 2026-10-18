package com.cloudflow.auth.service;

import com.cloudflow.auth.domain.SysJob;
import com.cloudflow.auth.service.jobclient.AuthJobExecutionClient;
import com.cloudflow.auth.service.jobclient.CrmJobExecutionClient;
import com.cloudflow.auth.service.jobclient.HrJobExecutionClient;
import com.cloudflow.auth.service.jobclient.JobExecutionFeignApi;
import com.cloudflow.auth.service.jobclient.OaJobExecutionClient;
import com.cloudflow.auth.service.jobclient.WorkflowJobExecutionClient;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.job.model.JobAcceptVO;
import com.cloudflow.common.job.model.JobExecuteDTO;
import com.cloudflow.common.job.model.JobStatusVO;
import org.springframework.stereotype.Component;

/**
 * auth 到五个执行服务的 Feign 调度路由；实例选择和故障转移由 Spring Cloud LoadBalancer 完成。
 */
@Component
public class JobDispatchClient {
    private final AuthJobExecutionClient authClient;
    private final WorkflowJobExecutionClient workflowClient;
    private final OaJobExecutionClient oaClient;
    private final CrmJobExecutionClient crmClient;
    private final HrJobExecutionClient hrClient;

    public JobDispatchClient(AuthJobExecutionClient authClient,
                             WorkflowJobExecutionClient workflowClient,
                             OaJobExecutionClient oaClient,
                             CrmJobExecutionClient crmClient,
                             HrJobExecutionClient hrClient) {
        this.authClient = authClient;
        this.workflowClient = workflowClient;
        this.oaClient = oaClient;
        this.crmClient = crmClient;
        this.hrClient = hrClient;
    }

    public R<JobAcceptVO> execute(SysJob job, JobExecuteDTO request, String tenantId) {
        JobExecutionFeignApi client = client(job == null ? null : job.getServiceName());
        return client == null ? R.fail(503, "目标服务不可用") : client.execute(tenantId, request);
    }

    public R<JobStatusVO> status(SysJob job, String executeNo, String tenantId) {
        JobExecutionFeignApi client = client(job == null ? null : job.getServiceName());
        return client == null ? R.fail(503, "目标服务不可用") : client.status(tenantId, executeNo);
    }

    private JobExecutionFeignApi client(String serviceName) {
        if (serviceName == null || serviceName.isBlank()) return null;
        return switch (serviceName.trim()) {
            case "auth", "cloudflow-auth" -> authClient;
            case "workflow", "cloudflow-service-workflow" -> workflowClient;
            case "oa", "cloudflow-service-oa" -> oaClient;
            case "crm", "cloudflow-service-crm" -> crmClient;
            case "hr", "cloudflow-service-hr" -> hrClient;
            default -> null;
        };
    }
}
