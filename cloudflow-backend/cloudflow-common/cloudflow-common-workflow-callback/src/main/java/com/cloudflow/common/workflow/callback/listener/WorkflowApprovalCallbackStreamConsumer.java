package com.cloudflow.common.workflow.callback.listener;

import com.cloudflow.common.redis.core.RedisStreamUtil;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackProperties;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.service.CallbackIdempotentStore;
import com.cloudflow.common.workflow.callback.service.WorkflowCallbackService;
import com.cloudflow.common.workflow.callback.util.WorkflowCallbackMetadata;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.stream.StreamListener;

import java.time.Duration;
import java.util.Map;
import java.util.HashMap;
import java.util.Set;
import java.util.concurrent.ScheduledFuture;

@Slf4j
public class WorkflowApprovalCallbackStreamConsumer
        implements StreamListener<String, MapRecord<String, String, String>> {

    private final WorkflowCallbackService workflowCallbackService;
    private final RedisStreamUtil redisStreamUtil;
    private final WorkflowCallbackProperties properties;
    private final CallbackIdempotentStore idempotentStore;
    private final DeadLetterHandler deadLetterHandler;

    public WorkflowApprovalCallbackStreamConsumer(WorkflowCallbackService workflowCallbackService, RedisStreamUtil redisStreamUtil,
            WorkflowCallbackProperties properties, CallbackIdempotentStore idempotentStore, DeadLetterHandler deadLetterHandler) {
        properties.validate();
        this.workflowCallbackService = workflowCallbackService;
        this.redisStreamUtil = redisStreamUtil;
        this.properties = properties;
        this.idempotentStore = idempotentStore;
        this.deadLetterHandler = deadLetterHandler;
    }

    @Override
    public void onMessage(MapRecord<String, String, String> message) {
        String msgId = message.getId().getValue();
        Map<String, String> body = message.getValue();
        ApprovalResultDTO dto;
        try {
            dto = buildDto(body);
        } catch (Exception invalid) {
            fail(message, null, invalid);
            return;
        }
        CallbackIdempotentStore.Lease lease;
        Duration processingTtl = Duration.ofSeconds(properties.getProcessingLeaseSeconds());
        try {
            lease = idempotentStore.acquire(dto.getTenantId(), dto.getProcessInstanceId(), processingTtl);
        } catch (Exception unavailable) {
            log.error("回调租约获取失败，消息保持待处理: msgId={}", msgId, unavailable);
            return;
        }
        if (lease.state() == CallbackIdempotentStore.State.PROCESSING) return;
        if (lease.state() == CallbackIdempotentStore.State.DONE) {
            acknowledgeDone(lease, msgId);
            return;
        }
        ScheduledFuture<?> renewal = null;
        try {
            renewal = idempotentStore.keepAlive(lease, processingTtl);
            try {
                TenantBroker.runAs(dto.getTenantId(), tenantId -> workflowCallbackService.handleApprovalResult(dto));
            } catch (Exception failure) {
                fail(message, lease, failure);
                return;
            }
            if (idempotentStore.complete(lease, Duration.ofHours(properties.getIdempotentTtlHours()))) {
                acknowledgeDone(lease, msgId);
            } else {
                log.warn("回调处理租约已失效，旧持有者不确认消息: msgId={}", msgId);
            }
        } catch (Exception unavailable) {
            log.error("回调完成标记未确认，消息保持待处理: msgId={}", msgId, unavailable);
        } finally {
            if (renewal != null) renewal.cancel(false);
        }
    }

    private void acknowledgeDone(CallbackIdempotentStore.Lease lease, String msgId) {
        try {
            idempotentStore.acknowledgeDone(lease, properties.getStreamKey(), properties.getGroup(), msgId);
        } catch (Exception failure) {
            log.warn("回调业务已完成，确认失败将由后续重领恢复: msgId={}", msgId, failure);
        }
    }

    private void fail(MapRecord<String, String, String> message, CallbackIdempotentStore.Lease lease, Exception failure) {
        String msgId = message.getId().getValue();
        try {
            if (lease != null && !idempotentStore.renew(lease, Duration.ofSeconds(properties.getProcessingLeaseSeconds()))) return;
            long deliveryCount = redisStreamUtil.pendingDeliveryCountGlobal(properties.getStreamKey(), properties.getGroup(), msgId);
            log.error("回调消费失败(第{}次投递): streamKey={}, msgId={}", deliveryCount, properties.getStreamKey(), msgId, failure);
            if (deliveryCount >= properties.getMaxRetry()) {
                String instanceId;
                try {
                    instanceId = normalize(message.getValue().get("processInstanceId"));
                } catch (IllegalArgumentException invalid) {
                    instanceId = null;
                }
                deadLetterHandler.record(properties.getStreamKey(), instanceId, message.getValue(),
                        (int) Math.min(Integer.MAX_VALUE, deliveryCount), failure.getMessage());
                if (lease == null) {
                    redisStreamUtil.ackGlobal(properties.getStreamKey(), properties.getGroup(), msgId);
                    redisStreamUtil.deleteGlobal(properties.getStreamKey(), msgId);
                } else {
                    idempotentStore.acknowledgeFailure(lease, properties.getStreamKey(), properties.getGroup(), msgId);
                }
            }
        } catch (Exception deliveryFailure) {
            log.error("回调失败消息尚未安全转存，保持待处理: msgId={}", msgId, deliveryFailure);
        } finally {
            if (lease != null) {
                try {
                    idempotentStore.release(lease);
                } catch (Exception releaseFailure) {
                    log.warn("回调处理租约释放失败，将等待到期: msgId={}", msgId, releaseFailure);
                }
            }
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
        if (dto.getTenantId() == null || dto.getTenantId() <= 0 || dto.getBusinessId() == null || dto.getBusinessId() <= 0
                || dto.getProcessInstanceId() == null || dto.getProcessInstanceId().isBlank()
                || dto.getBusinessType() == null || dto.getBusinessType().isBlank()
                || dto.getApprovalResult() == null || !Set.of("APPROVED", "REJECTED").contains(dto.getApprovalResult())) {
            throw new IllegalArgumentException("审批回调身份或结果无效");
        }
        Map<String, Object> metadata = new HashMap<>();
        if (body.containsKey(WorkflowCallbackMetadata.OA_REQUEST_TOKEN)) {
            metadata.put(WorkflowCallbackMetadata.OA_REQUEST_TOKEN,
                    WorkflowCallbackMetadata.decodeStreamValue(body.get(WorkflowCallbackMetadata.OA_REQUEST_TOKEN)));
        }
        dto.setVariables(WorkflowCallbackMetadata.variables(dto.getBusinessType(), metadata));
        return dto;
    }

    private Long parseLong(String value) {
        String v = normalize(value);
        if (v == null || v.isBlank()) return null;
        try { return Long.parseLong(v); } catch (NumberFormatException e) { return null; }
    }

    private String normalize(String value) {
        String decoded = WorkflowCallbackMetadata.decodeStreamValue(value);
        return decoded == null ? null : decoded.trim();
    }
}
