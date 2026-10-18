package com.cloudflow.workflow.callback;

import com.cloudflow.common.redis.core.RedisStreamUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.common.workflow.callback.util.WorkflowCallbackMetadata;
import com.cloudflow.workflow.domain.WfCallbackDeadLetter;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.enums.WfProcessStatus;
import com.cloudflow.workflow.mapper.WfCallbackDeadLetterMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Slf4j
@Component
@RequiredArgsConstructor
public class CallbackDlqReplayer {

    private final WfCallbackDeadLetterMapper deadLetterMapper;
    private final ObjectMapper objectMapper;
    private final RedisStreamUtil redisStreamUtil;
    private final com.cloudflow.workflow.service.WorkflowTriggerService triggerService;
    private final WfProcessInstanceMapper instanceMapper;

    public void replay(WfCallbackDeadLetter dlq) {
        Long tenantId = UserContext.getTenantId();
        if (dlq == null || tenantId == null || tenantId <= 0 || !Objects.equals(tenantId, dlq.getTenantId())
                || TenantContext.getTenantId() != null && !Objects.equals(tenantId, TenantContext.getTenantId())) {
            throw new IllegalArgumentException("无权重放其他租户的回调");
        }
        if (com.cloudflow.workflow.service.WorkflowTriggerService.BUSINESS_TYPE.equals(dlq.getBusinessType())) {
            triggerService.replay(dlq);
            return;
        }
        try {
            Map<String, String> payload = objectMapper.readValue(
                    dlq.getPayloadJson(), new TypeReference<Map<String, String>>() {});
            if (payload == null || !"PENDING".equals(dlq.getStatus()) || dlq.getProcessInstanceId() == null
                    || dlq.getProcessInstanceId().isBlank() || dlq.getBusinessType() == null || dlq.getBusinessId() == null
                    || dlq.getBusinessId() <= 0 || !Objects.equals(tenantId, number(payload.get("tenantId")))
                    || !Objects.equals(dlq.getProcessInstanceId(), text(payload.get("processInstanceId")))
                    || !Objects.equals(dlq.getBusinessType(), text(payload.get("businessType")))
                    || !Objects.equals(dlq.getBusinessId(), number(payload.get("businessId")))) {
                throw new IllegalArgumentException("死信回调身份不一致");
            }
            WfProcessInstance instance = instanceMapper.selectOne(new LambdaQueryWrapper<WfProcessInstance>()
                    .eq(WfProcessInstance::getTenantId, tenantId)
                    .eq(WfProcessInstance::getInstanceId, dlq.getProcessInstanceId()));
            if (instance == null || !Objects.equals(tenantId, instance.getTenantId())
                    || !Objects.equals(dlq.getProcessInstanceId(), instance.getInstanceId())
                    || Integer.valueOf(1).equals(instance.getDeleted())) {
                throw new IllegalArgumentException("回调流程实例不存在或租户不一致");
            }
            Map<String, Object> variables = objectMapper.readValue(instance.getVariables(), new TypeReference<Map<String, Object>>() {});
            String result = WfProcessStatus.isSuccess(instance.getStatus()) ? WorkflowCallbackConstants.RESULT_APPROVED
                    : WfProcessStatus.REJECTED.getCode().equals(instance.getStatus()) ? WorkflowCallbackConstants.RESULT_REJECTED : null;
            String stream = variables == null ? null : string(variables.get("callbackStreamKey"));
            if (stream == null || stream.isBlank()) stream = WorkflowCallbackConstants.DEFAULT_APPROVAL_CALLBACK_STREAM_KEY;
            if (variables == null || result == null || !Objects.equals(result, text(payload.get("approvalResult")))
                    || !Objects.equals(dlq.getBusinessType(), string(variables.get("businessType")))
                    || !Objects.equals(dlq.getBusinessId(), number(string(variables.get("businessId"))))
                    || !Objects.equals(dlq.getStreamKey(), stream)) {
                throw new IllegalArgumentException("回调业务、通道或最终审批结果不一致");
            }
            Map<String, Object> metadata = WorkflowCallbackMetadata.variables(dlq.getBusinessType(), variables);
            if (payload.containsKey(WorkflowCallbackMetadata.OA_REQUEST_TOKEN)
                    && !Objects.equals(WorkflowCallbackMetadata.decodeStreamValue(payload.get(WorkflowCallbackMetadata.OA_REQUEST_TOKEN)),
                            metadata.get(WorkflowCallbackMetadata.OA_REQUEST_TOKEN))) {
                throw new IllegalArgumentException("回调提交令牌与持久化实例不一致");
            }
            Map<String, Object> body = new HashMap<>();
            for (String field : Set.of("tenantId", "processInstanceId", "businessType", "businessId", "businessNo",
                    "approvalResult", "approvalComment", "approverId", "approverName", "approvalTime")) {
                if (payload.get(field) != null) body.put(field, WorkflowCallbackMetadata.decodeStreamValue(payload.get(field)));
            }
            body.putAll(metadata);
            String messageId = redisStreamUtil.publishGlobal(stream, body);
            if (messageId == null || messageId.isBlank()) throw new IllegalStateException("回调重放消息未成功写入");
            dlq.setStatus("REPLAYED");
            dlq.setUpdateTime(LocalDateTime.now());
            if (deadLetterMapper.updateById(dlq) != 1) throw new IllegalStateException("死信记录已变更，请重新读取");
        } catch (Exception e) {
            log.error("重投死信消息失败: id={}", dlq.getId(), e);
            throw new IllegalStateException("回调重放失败，原始审批记录未修改", e);
        }
    }

    private String text(String value) {
        String decoded = WorkflowCallbackMetadata.decodeStreamValue(value);
        return decoded == null ? null : decoded.trim();
    }

    private String string(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private Long number(String value) {
        String decoded = text(value);
        if (decoded == null || !decoded.matches("[1-9][0-9]*")) return null;
        try {
            return Long.valueOf(decoded);
        } catch (NumberFormatException exception) {
            return null;
        }
    }
}
