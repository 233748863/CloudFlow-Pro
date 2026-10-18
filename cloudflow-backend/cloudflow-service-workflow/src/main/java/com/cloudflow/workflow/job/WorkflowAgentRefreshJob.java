package com.cloudflow.workflow.job;

import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.job.annotation.JobHandler;
import com.cloudflow.workflow.service.WorkflowAgentService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class WorkflowAgentRefreshJob {
    private final WorkflowAgentService agents;

    @JobHandler(value = "workflowAgentRefresh", desc = "刷新当前租户生效及到期的任务代理")
    @DistributedJob(name = "workflow-agent-refresh", lockTime = 240)
    public void refresh() {
        Long afterUserId = 0L;
        int processed = 0;
        List<Long> principals;
        do {
            principals = agents.refreshPrincipals(afterUserId, 100);
            for (Long principalId : principals) {
                agents.refreshPrincipal(principalId);
                afterUserId = principalId;
                processed++;
            }
        } while (principals.size() == 100);
        log.info("任务代理生效及到期刷新完成，负责人数量={}", processed);
    }
}
