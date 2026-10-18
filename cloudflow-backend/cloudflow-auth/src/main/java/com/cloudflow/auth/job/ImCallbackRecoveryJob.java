package com.cloudflow.auth.job;

import com.cloudflow.auth.im.ImCallbackRecovery;
import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.job.annotation.JobHandler;
import com.cloudflow.common.job.model.JobResult;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ImCallbackRecoveryJob {
    private final ImCallbackRecovery callbacks;

    @JobHandler(value = "imCallbackRecovery", desc = "处理已验签持久回调并按事件审批历史恢复结果")
    @DistributedJob(name = "im-callback-recovery", lockTime = 300)
    public JobResult recover() {
        ImCallbackRecovery.Sweep result = callbacks.recoverDue();
        String message = "已检查=" + result.attempted() + "；已记录结果=" + result.recorded()
                + "；等待其他处理器=" + result.waiting() + "；失败=" + result.failed();
        return result.failed() == 0 ? JobResult.success(result.recorded(), message) : JobResult.failed(message);
    }
}
