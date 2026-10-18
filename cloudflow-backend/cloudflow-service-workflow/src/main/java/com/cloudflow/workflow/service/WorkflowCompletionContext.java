package com.cloudflow.workflow.service;

import java.util.function.Supplier;

public final class WorkflowCompletionContext {
    private static final ThreadLocal<Boolean> AUTOMATIC = new ThreadLocal<>();
    private static final ThreadLocal<String> TIMEOUT_TASK = new ThreadLocal<>();

    private WorkflowCompletionContext() {
    }

    public static boolean isAutomatic() {
        return Boolean.TRUE.equals(AUTOMATIC.get());
    }

    public static boolean isTimeoutTask(String taskId) {
        return isAutomatic() && taskId != null && taskId.equals(TIMEOUT_TASK.get());
    }

    /** 仅指定的超时任务登记结果通知；下游自动节点不会继承该任务身份。 */
    public static <ResultType> ResultType forTimeout(String taskId, Supplier<ResultType> operation) {
        String previous = TIMEOUT_TASK.get();
        TIMEOUT_TASK.set(java.util.Objects.requireNonNull(taskId, "超时任务ID不能为空"));
        try {
            return operation.get();
        } finally {
            if (previous == null) TIMEOUT_TASK.remove();
            else TIMEOUT_TASK.set(previous);
        }
    }

    public static <ResultType> ResultType automatically(Supplier<ResultType> operation) {
        Boolean previous = AUTOMATIC.get();
        AUTOMATIC.set(true);
        try {
            return operation.get();
        } finally {
            if (previous == null) {
                AUTOMATIC.remove();
            } else {
                AUTOMATIC.set(previous);
            }
        }
    }
}
