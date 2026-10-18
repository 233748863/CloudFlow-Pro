package com.cloudflow.auth.job;

import com.cloudflow.auth.im.ImSyncRunner;
import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.job.annotation.JobHandler;
import com.cloudflow.common.job.model.JobResult;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ImSyncRecoveryJob {
    private final ImSyncRunner runner;

    @JobHandler(value = "imSyncRecovery", desc = "恢复已确认的组织同步及已提交变更的安全清理")
    @DistributedJob(name = "im-sync-recovery", lockTime = 300)
    public JobResult recover() {
        ImSyncRunner.Sweep result = runner.recoverDue();
        String message = "已检查=" + result.attempted() + "；已完成=" + result.completed()
                + "；待继续=" + result.pending() + "；失败=" + result.failed();
        return result.failed() == 0 ? JobResult.success(result.completed(), message) : JobResult.failed(message);
    }
}
