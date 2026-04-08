package com.cloudflow.oa.listener;

import com.cloudflow.common.core.utils.RedisStreamUtil;
import com.cloudflow.oa.config.WorkflowCallbackStreamConstants;
import com.cloudflow.oa.domain.dto.ApprovalResultDTO;
import com.cloudflow.oa.service.WorkflowCallbackService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.stream.StreamListener;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 消费 workflow 发布给 OA 的审批结果事件。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class WorkflowApprovalCallbackStreamConsumer implements StreamListener<String, MapRecord<String, String, String>> {

    private final WorkflowCallbackService workflowCallbackService;
    private final RedisStreamUtil redisStreamUtil;

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

            redisStreamUtil.ackGlobal(
                    WorkflowCallbackStreamConstants.APPROVAL_CALLBACK_STREAM_KEY,
                    WorkflowCallbackStreamConstants.APPROVAL_CALLBACK_GROUP,
                    msgId
            );
            redisStreamUtil.deleteGlobal(WorkflowCallbackStreamConstants.APPROVAL_CALLBACK_STREAM_KEY, msgId);
            log.info("OA 审批结果事件消费成功并已确认: msgId={}, businessType={}, businessId={}, result={}",
                    msgId, dto.getBusinessType(), dto.getBusinessId(), dto.getApprovalResult());
        } catch (Exception e) {
            log.error("OA 消费审批结果事件失败: msgId={}, body={}", msgId, body, e);
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

    /**
     * Redis Stream 使用 JSON 序列化时，字符串字段可能带外层引号，这里统一剥离。
     */
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
