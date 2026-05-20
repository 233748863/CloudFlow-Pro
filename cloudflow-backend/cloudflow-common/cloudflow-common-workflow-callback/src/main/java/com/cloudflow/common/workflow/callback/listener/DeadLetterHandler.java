package com.cloudflow.common.workflow.callback.listener;

import java.util.Map;

public interface DeadLetterHandler {
    void record(String streamKey, String processInstanceId, Map<String, String> payload, int retryCount, String lastError);
}
