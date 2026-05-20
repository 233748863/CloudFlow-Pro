package com.cloudflow.common.workflow.callback.listener;

import com.cloudflow.common.redis.core.RedisStreamUtil;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackProperties;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.service.CallbackIdempotentStore;
import com.cloudflow.common.workflow.callback.service.WorkflowCallbackService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.stream.StreamListener;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@Slf4j
@RequiredArgsConstructor
public class WorkflowApprovalCallbackStreamConsumer
        implements StreamListener<String, MapRecord<String, String, String>> {

    private final WorkflowCallbackService workflowCallbackService;
    private final RedisStreamUtil redisStreamUtil;
    private final WorkflowCallbackProperties properties;
    private final CallbackIdempotentStore idempotentStore;
    private final DeadLetterHandler deadLetterHandler;

    private final ConcurrentHashMap<String, AtomicInteger> retryCounters = new ConcurrentHashMap<>();

    @Override
    public void onMessage(MapRecord<String, String, String> message) {
        String msgId = message.getId().getValue();
        Map<String, String> body = message.getValue();
        String processInstanceId = normalize(body.get("processInstanceId"));

        if (!idempotentStore.acquire(processInstanceId, Duration.ofHours(properties.getIdempotentTtlHours()))) {
            log.warn("重复消息已跳过: streamKey={}, msgId={}, processInstanceId={}", properties.getStreamKey(), msgId, processInstanceId);
            redisStreamUtil.ackGlobal(properties.getStreamKey(), properties.getGroup(), msgId);
            redisStreamUtil.deleteGlobal(properties.getStreamKey(), msgId);
            return;
        }

        try {
            ApprovalResultDTO dto = buildDto(body);
            workflowCallbackService.handleApprovalResult(dto);
            redisStreamUtil.ackGlobal(properties.getStreamKey(), properties.getGroup(), msgId);
            redisStreamUtil.deleteGlobal(properties.getStreamKey(), msgId);
            retryCounters.remove(processInstanceId);
            log.info("审批结果消费成功: streamKey={}, msgId={}, businessType={}, businessId={}, result={}",
                    properties.getStreamKey(), msgId, dto.getBusinessType(), dto.getBusinessId(), dto.getApprovalResult());
        } catch (Exception e) {
            idempotentStore.release(processInstanceId);
            int count = retryCounters.computeIfAbsent(processInstanceId, k -> new AtomicInteger(0))
                    .incrementAndGet();
            log.error("消费审批结果失败(第{}次): streamKey={}, msgId={}", count, properties.getStreamKey(), msgId, e);
            if (count >= properties.getMaxRetry()) {
                retryCounters.remove(processInstanceId);
                deadLetterHandler.record(properties.getStreamKey(), processInstanceId, body, count, e.getMessage());
                redisStreamUtil.ackGlobal(properties.getStreamKey(), properties.getGroup(), msgId);
                redisStreamUtil.deleteGlobal(properties.getStreamKey(), msgId);
            }
            // 未达上限：不 ACK，让 pending 重投
        }
    }

    private ApprovalResultDTO buildDto(Map<String, String> body) {
        ApprovalResultDTO dto = new ApprovalResultDTO();
        dto.setTenantId(parseLong(body.get("tenantId")));
        dto.setProcessInstanceId(normalize(body.get("processInstanceId")));
        dto.setBusinessType(normalize(body.get("businessType")));
        dto.setBusinessId(parseLong(body.get("businessId")));
        dto.setBusinessNo(normalize(body.get("businessNo")));
        dto.setApprovalResult(normalize(body.get("approvalResult")));
        dto.setApprovalComment(normalize(body.get("approvalComment")));
        dto.setApproverId(parseLong(body.get("approverId")));
        dto.setApproverName(normalize(body.get("approverName")));
        dto.setApprovalTime(parseLong(body.get("approvalTime")));
        return dto;
    }

    private Long parseLong(String value) {
        String v = normalize(value);
        if (v == null || v.isBlank()) return null;
        try { return Long.parseLong(v); } catch (NumberFormatException e) { return null; }
    }

    private String normalize(String value) {
        if (value == null) return null;
        String v = value.trim();
        if (v.length() >= 2 && v.startsWith("\"") && v.endsWith("\"")) {
            v = v.substring(1, v.length() - 1);
        }
        return v;
    }
}
