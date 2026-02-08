package com.cloudflow.workflow.service;

/**
 * Saga事务补偿服务接口
 * 当流程执行失败时，自动回滚已执行的步骤
 */
public interface IWorkflowSagaService {

    /** 记录 Saga 步骤（用于后续补偿） */
    void recordSagaStep(String instanceId, String stepId, String stepType, String data);

    /** 执行补偿（回滚） */
    void compensate(String instanceId, String reason);

    /** 清理 Saga 日志 */
    void cleanupSagaLog(String instanceId);

    /** 检查实例是否需要补偿 */
    boolean needsCompensation(String instanceId);
}
