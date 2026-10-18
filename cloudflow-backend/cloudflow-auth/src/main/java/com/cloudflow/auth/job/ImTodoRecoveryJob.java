package com.cloudflow.auth.job;

import com.cloudflow.auth.im.ImTodoRecovery;
import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.job.annotation.JobHandler;
import com.cloudflow.common.job.model.JobResult;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ImTodoRecoveryJob {
    private final ImTodoRecovery todos;

    @JobHandler(value = "imTodoRecovery", desc = "扫描实际待办并恢复企业微信卡片投递状态")
    @DistributedJob(name = "im-todo-recovery", lockTime = 300)
    public JobResult recover() {
        ImTodoRecovery.Sweep result = todos.recoverDue();
        String message = "已扫描=" + result.scanned() + "；已更新投递状态=" + result.synchronizedRows() + "；失败=" + result.failed();
        return result.failed() == 0 ? JobResult.success(result.synchronizedRows(), message) : JobResult.failed(message);
    }
}
