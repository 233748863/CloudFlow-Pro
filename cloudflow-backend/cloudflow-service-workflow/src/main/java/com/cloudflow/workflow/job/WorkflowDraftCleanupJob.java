package com.cloudflow.workflow.job;

import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.job.annotation.JobHandler;
import com.cloudflow.workflow.service.WfFormDraftService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class WorkflowDraftCleanupJob {
    private final WfFormDraftService drafts;

    @JobHandler(value = "workflowDraftCleanup", desc = "清理当前租户到期的流程草稿")
    @DistributedJob(name = "workflow-draft-cleanup-job", lockTime = 240)
    public void cleanup() {
        int removed = 0;
        int batch;
        do {
            batch = drafts.cleanup();
            removed += batch;
        } while (batch == 500);
        log.info("[workflowDraftCleanup] 到期草稿清理完成，删除数量={}", removed);
    }
}
