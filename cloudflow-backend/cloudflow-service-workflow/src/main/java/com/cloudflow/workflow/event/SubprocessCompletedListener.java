package com.cloudflow.workflow.event;

import com.cloudflow.workflow.service.IWfInstanceService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * 子流程结束事件监听器
 * 监听 SubprocessCompletedEvent，转发到 IWfInstanceService.handleSubprocessFinished，
 * 在实例锁 + 事务保护下按子流程终态恢复或挂起父流程（幂等）。
 *
 * 使用 @TransactionalEventListener(AFTER_COMMIT)：仅在子流程终态事务提交后才处理，
 * 避免读到未提交/已回滚的数据；fallbackExecution=true 兼容无事务上下文的发布方。
 *
 * @author CloudFlow
 */
@Component
public class SubprocessCompletedListener {

    private static final Logger log = LoggerFactory.getLogger(SubprocessCompletedListener.class);

    private final IWfInstanceService instanceService;

    public SubprocessCompletedListener(@Lazy IWfInstanceService instanceService) {
        this.instanceService = instanceService;
    }

    /**
     * 处理子流程结束事件：COMPLETED → 恢复父流程流转；异常终态 → 挂起父流程
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    @Async
    public void onSubprocessCompleted(SubprocessCompletedEvent event) {
        try {
            instanceService.handleSubprocessFinished(
                    event.getParentInstanceId(),
                    event.getParentNodeKey(),
                    event.getChildInstanceId(),
                    event.getChildStatus());
        } catch (Exception e) {
            log.error("[SubprocessCompletedListener] 处理子流程结束事件失败, parentInstanceId={}, parentNodeKey={}, childInstanceId={}, childStatus={}: {}",
                    event.getParentInstanceId(), event.getParentNodeKey(),
                    event.getChildInstanceId(), event.getChildStatus(), e.getMessage(), e);
        }
    }
}
