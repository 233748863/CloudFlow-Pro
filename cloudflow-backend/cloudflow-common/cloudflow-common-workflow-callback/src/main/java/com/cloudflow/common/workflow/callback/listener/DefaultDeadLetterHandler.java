package com.cloudflow.common.workflow.callback.listener;

import com.cloudflow.common.redis.core.RedisStreamUtil;
import com.cloudflow.common.workflow.callback.util.WorkflowCallbackMetadata;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import java.util.HashMap;
import java.util.Map;

@Slf4j
@RequiredArgsConstructor
public class DefaultDeadLetterHandler implements DeadLetterHandler {

    public static final String DLQ_STREAM_KEY = "wf:dlq:callback";

    private final RedisStreamUtil redisStreamUtil;

    @Override
    public void record(String streamKey, String processInstanceId, Map<String, String> payload, int retryCount, String lastError) {
        try {
            Map<String, Object> body = new HashMap<>();
            for (String field : WorkflowCallbackMetadata.MESSAGE_FIELDS) {
                if (payload.get(field) == null) continue;
                try {
                    body.put(field, WorkflowCallbackMetadata.decodeStreamValue(payload.get(field)));
                } catch (IllegalArgumentException invalidEncoding) {
                    body.put(field, payload.get(field));
                }
            }
            body.put("__streamKey", streamKey);
            body.put("__processInstanceId", processInstanceId == null ? "" : processInstanceId);
            body.put("__retryCount", String.valueOf(retryCount));
            body.put("__lastError", lastError == null ? "" : lastError);
            String messageId = redisStreamUtil.publishGlobal(DLQ_STREAM_KEY, body);
            if (messageId == null || messageId.isBlank()) throw new IllegalStateException("死信消息未成功写入");
            log.warn("[DLQ] 死信已转发: streamKey={}, processInstanceId={}, retry={}", streamKey, processInstanceId, retryCount);
        } catch (Exception e) {
            log.error("[DLQ] 死信转发失败: streamKey={}, processInstanceId={}", streamKey, processInstanceId, e);
            throw new IllegalStateException("死信消息转发失败，原消息必须保持待处理", e);
        }
    }
}
