package com.cloudflow.common.workflow.callback.listener;

import com.cloudflow.common.redis.core.RedisStreamUtil;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackProperties;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.service.WorkflowCallbackService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.stream.StreamListener;

import java.util.Map;

/**
 * 通用的工作流审批回调 Stream 消费者。
 *
 * <p>由 {@code WorkflowCallbackAutoConfiguration} 注册为 Bean，业务侧无需自实现。
 */
@Slf4j
@RequiredArgsConstructor
public class WorkflowApprovalCallbackStreamConsumer
        implements StreamListener<String, MapRecord<String, String, String>> {

    private final WorkflowCallbackService workflowCallbackService;
    private final RedisStreamUtil redisStreamUtil;
    private final WorkflowCallbackProperties properties;

    @Override
    public void onMessage(MapRecord<String, String, String> message) {
        String msgId = message.getId().getValue();
        Map<String, String> body = message.getValue();
        try {
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

            workflowCallbackService.handleApprovalResult(dto);

            redisStreamUtil.ackGlobal(properties.getStreamKey(), properties.getGroup(), msgId);
            redisStreamUtil.deleteGlobal(properties.getStreamKey(), msgId);
            log.info("审批结果事件消费成功并已确认: streamKey={}, msgId={}, businessType={}, businessId={}, result={}",
                    properties.getStreamKey(), msgId, dto.getBusinessType(), dto.getBusinessId(), dto.getApprovalResult());
        } catch (Exception e) {
            log.error("消费审批结果事件失败: streamKey={}, msgId={}, body={}",
                    properties.getStreamKey(), msgId, body, e);
        }
    }

    private Long parseLong(String value) {
        String normalized = normalize(value);
        if (normalized == null || normalized.isBlank()) {
            return null;
        }
        try {
            return Long.parseLong(normalized);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** Redis Stream 使用 JSON 序列化时，字符串字段可能带外层引号，这里统一剥离。 */
    private String normalize(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        if (normalized.length() >= 2 && normalized.startsWith("\"") && normalized.endsWith("\"")) {
            normalized = normalized.substring(1, normalized.length() - 1);
        }
        return normalized;
    }
}
