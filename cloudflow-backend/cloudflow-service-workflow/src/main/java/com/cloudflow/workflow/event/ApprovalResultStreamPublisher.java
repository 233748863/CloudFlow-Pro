package com.cloudflow.workflow.event;

import com.cloudflow.common.core.utils.RedisStreamUtil;
import com.cloudflow.workflow.config.WorkflowCallbackStreamConstants;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.Map;

/**
 * 将审批结果发布到 Redis Stream，供业务服务解耦消费。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ApprovalResultStreamPublisher {

    private final WfProcessInstanceMapper processInstanceMapper;
    private final RedisStreamUtil redisStreamUtil;
    private final ObjectMapper objectMapper;

    @Async("workflowEventExecutor")
    @EventListener
    public void onProcessCompleted(ProcessCompletedEvent event) {
        publish(event.getInstanceId(), "APPROVED", null, event.getOperatorId(), event.getOperatorName());
    }

    @Async("workflowEventExecutor")
    @EventListener
    public void onProcessRejected(ProcessRejectedEvent event) {
        publish(event.getInstanceId(), "REJECTED", event.getComment(), event.getOperatorId(), event.getOperatorName());
    }

    private void publish(String instanceId, String approvalResult, String comment, Long approverId, String approverName) {
        WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
        if (instance == null) {
            log.warn("[ApprovalResultStream] 流程实例不存在，忽略回调消息: instanceId={}", instanceId);
            return;
        }

        Map<String, Object> variables = parseVariables(instance.getVariables());
        String businessType = asText(variables.get("businessType"));
        Long businessId = asLong(variables.get("businessId"));
        if (!StringUtils.hasText(businessType) || businessId == null) {
            log.debug("[ApprovalResultStream] 未发现业务回调元数据，跳过发布: instanceId={}, businessKey={}",
                    instanceId, instance.getBusinessKey());
            return;
        }

        String streamKey = asText(variables.get("callbackStreamKey"));
        if (!StringUtils.hasText(streamKey)) {
            streamKey = WorkflowCallbackStreamConstants.APPROVAL_CALLBACK_STREAM_KEY;
        }

        Map<String, Object> body = new HashMap<>();
        body.put("tenantId", String.valueOf(instance.getTenantId()));
        body.put("processInstanceId", instanceId);
        body.put("businessType", businessType);
        body.put("businessId", String.valueOf(businessId));
        body.put("businessNo", asText(variables.get("businessNo")));
        body.put("approvalResult", approvalResult);
        body.put("approvalComment", comment == null ? "" : comment);
        body.put("approverId", approverId == null ? "" : String.valueOf(approverId));
        body.put("approverName", approverName == null ? "" : approverName);
        body.put("approvalTime", String.valueOf(System.currentTimeMillis()));

        // 回调 Stream 是跨微服务共享通道，必须写入全局 key。
        String messageId = redisStreamUtil.publishGlobal(streamKey, body);
        log.info("[ApprovalResultStream] 审批结果已发布: streamKey={}, messageId={}, businessType={}, businessId={}, result={}",
                streamKey, messageId, businessType, businessId, approvalResult);
    }

    private Map<String, Object> parseVariables(String variablesJson) {
        if (!StringUtils.hasText(variablesJson)) {
            return new HashMap<>();
        }
        try {
            return objectMapper.readValue(variablesJson, new TypeReference<Map<String, Object>>() {
            });
        } catch (Exception e) {
            log.warn("[ApprovalResultStream] 解析流程变量失败: instanceVariables={}", variablesJson, e);
            return new HashMap<>();
        }
    }

    private String asText(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private Long asLong(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
