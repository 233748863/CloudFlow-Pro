package com.cloudflow.workflow.job;

import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.job.annotation.JobHandler;
import com.cloudflow.workflow.service.WorkflowGatewayArchiveService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class WorkflowGatewayArchiveJob {
    private final WorkflowGatewayArchiveService archives;

    @JobHandler(value = "workflowGatewayArchiveCleanup", desc = "清理已归档终态实例的网关及到达记录")
    @DistributedJob(name = "workflow-gateway-archive", lockTime = 300)
    public void clean() {
        String afterId = "";
        int processed = 0;
        List<String> candidates;
        do {
            candidates = archives.candidates(afterId);
            for (String instanceId : candidates) {
                processed += archives.clean(instanceId);
                afterId = instanceId;
            }
        } while (candidates.size() == 100);
        log.info("已归档终态实例网关清理完成，实例数量={}", processed);
    }
}
