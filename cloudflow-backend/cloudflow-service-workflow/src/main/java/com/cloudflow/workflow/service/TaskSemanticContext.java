package com.cloudflow.workflow.service;

import java.util.function.Supplier;

public final class TaskSemanticContext {
    private static final ThreadLocal<String> TASK_TYPE = new ThreadLocal<>();

    private TaskSemanticContext() {
    }

    public static String resolve(String defaultType) {
        String taskType = TASK_TYPE.get();
        return taskType == null ? defaultType : taskType;
    }

    public static void withType(String taskType, Runnable operation) {
        callWithType(taskType, () -> {
            operation.run();
            return null;
        });
    }

    public static <ResultType> ResultType callWithType(String taskType, Supplier<ResultType> operation) {
        String previousType = TASK_TYPE.get();
        TASK_TYPE.set(taskType);
        try {
            return operation.get();
        } finally {
            if (previousType == null) {
                TASK_TYPE.remove();
            } else {
                TASK_TYPE.set(previousType);
            }
        }
    }
}
