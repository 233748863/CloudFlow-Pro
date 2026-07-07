package com.cloudflow.common.workflow.callback.listener;

import com.cloudflow.common.redis.core.RedisStreamUtil;
import com.cloudflow.common.tenant.TenantBroker;
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

@Slf4j
@RequiredArgsConstructor
public class WorkflowApprovalCallbackStreamConsumer
        implements StreamListener<String, MapRecord<String, String, String>> {

    private final WorkflowCallbackService workflowCallbackService;
    private final RedisStreamUtil redisStreamUtil;
    private final WorkflowCallbackProperties properties;
    private final CallbackIdempotentStore idempotentStore;
    private final DeadLetterHandler deadLetterHandler;

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
            // Stream 消费线程没有 HTTP/Sa-Token 上下文，必须显式补租户，
            // 否则 MP TenantLineInnerInterceptor 拿到 null 直接 ignoreTable 跨租户裸跑。
            TenantBroker.runAs(dto.getTenantId(), tid -> {
                workflowCallbackService.handleApprovalResult(dto);
            });
            redisStreamUtil.ackGlobal(properties.getStreamKey(), properties.getGroup(), msgId);
            redisStreamUtil.deleteGlobal(properties.getStreamKey(), msgId);
            log.info("审批结果消费成功: streamKey={}, msgId={}, businessType={}, businessId={}, result={}",
                    properties.getStreamKey(), msgId, dto.getBusinessType(), dto.getBusinessId(), dto.getApprovalResult());
        } catch (Exception e) {
            idempotentStore.release(processInstanceId);
            // B13: 重试次数取 Redis Stream pending 的 deliveryCount（XPENDING），
            // 由 Redis 维护，多实例部署、服务重启后依然准确，替代原进程内存计数
            long deliveryCount = redisStreamUtil.pendingDeliveryCountGlobal(
                    properties.getStreamKey(), properties.getGroup(), msgId);
            log.error("消费审批结果失败(第{}次投递): streamKey={}, msgId={}", deliveryCount, properties.getStreamKey(), msgId, e);
            if (deliveryCount >= properties.getMaxRetry()) {
                deadLetterHandler.record(properties.getStreamKey(), processInstanceId, body, (int) deliveryCount, e.getMessage());
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
