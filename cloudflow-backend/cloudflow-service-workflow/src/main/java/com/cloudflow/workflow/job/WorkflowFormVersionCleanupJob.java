package com.cloudflow.workflow.job;

import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.job.annotation.JobHandler;
import com.cloudflow.workflow.service.WorkflowFormVersionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class WorkflowFormVersionCleanupJob {
    private final WorkflowFormVersionService versions;

    @JobHandler(value = "workflowFormVersionCleanup", desc = "保留最近20个表单版本和全部实例引用版本")
    @DistributedJob(name = "workflow-form-version-cleanup", lockTime = 300)
    public void cleanup() {
        int total = 0;
        for (String formId : versions.cleanupFormIds()) {
            int removed;
            do { removed = versions.cleanupForm(formId); total += removed; } while (removed == 500);
        }
        log.info("表单版本清理完成，删除未引用历史版本数={}", total);
    }
}
