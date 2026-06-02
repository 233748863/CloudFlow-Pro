package com.cloudflow.oa.event.consumer;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.oa.constant.OaBusinessTypes;
import com.cloudflow.oa.domain.BizPaymentRequest;
import com.cloudflow.oa.domain.dto.InternalWorkflowStartDTO;
import com.cloudflow.oa.event.PaymentRequestSubmittedEvent;
import com.cloudflow.oa.service.impl.OaWorkflowFailureHelper;
import com.cloudflow.oa.service.impl.PaymentRequestServiceImpl;
import com.cloudflow.oa.service.remote.RemoteWorkflowService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class PaymentRequestSubmittedEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final RemoteWorkflowService remoteWorkflowService;
    private final PaymentRequestServiceImpl paymentRequestService;
    private final OaWorkflowFailureHelper workflowFailureHelper;

    @Override
    public String eventType() {
        return "PAYMENT_REQUEST_SUBMITTED";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        PaymentRequestSubmittedEvent event = objectMapper.readValue(envelope.getPayload(), PaymentRequestSubmittedEvent.class);
        BizPaymentRequest payment = paymentRequestService.getById(event.getPaymentId());
        if (payment == null) {
            log.warn("skip payment workflow start, payment not found, paymentId={}, eventId={}", event.getPaymentId(), envelope.getEventId());
            return;
        }
        if (payment.getInstanceId() != null && !payment.getInstanceId().isBlank()) {
            log.info("skip payment workflow start, instance already exists, paymentId={}, instanceId={}", payment.getId(), payment.getInstanceId());
            return;
        }
        startWorkflow(payment, event);
    }

    private void startWorkflow(BizPaymentRequest payment, PaymentRequestSubmittedEvent event) {
        try {
            InternalWorkflowStartDTO req = new InternalWorkflowStartDTO();
            req.setProcessDefKey("payment_request");
            req.setBusinessKey("PAYMENT_REQUEST:" + payment.getId());
            req.setStartUserId(event.getUserId());
            req.setStartUserName(event.getUserName());
            Map<String, Object> variables = new HashMap<>();
            variables.put("paymentId", payment.getId());
            variables.put("paymentNo", event.getPaymentNo());
            variables.put("amount", event.getAmount());
            variables.put("userId", event.getUserId());
            variables.put("userName", event.getUserName());
            variables.put("paymentType", event.getPaymentType());
            variables.put("payeeName", event.getPayeeName());
            variables.put("payeeAccount", event.getPayeeAccount());
            variables.put("payeeBank", event.getPayeeBank());
            variables.put("reason", event.getReason());
            variables.put("deptName", event.getDeptName());
            WorkflowCallbackConstants.applyCallbackMetadata(
                    variables,
                    OaBusinessTypes.PAYMENT_REQUEST,
                    payment.getId(),
                    event.getPaymentNo(),
                    "workflow:stream:approval-callback:oa"
            );
            req.setVariables(variables);
            R<?> result = remoteWorkflowService.startProcessInternal(req);
            if (result != null && result.getCode() == 200 && result.getData() != null) {
                String instanceId = extractInstanceId(result.getData());
                if (instanceId != null) {
                    BizPaymentRequest update = new BizPaymentRequest();
                    update.setId(payment.getId());
                    update.setInstanceId(instanceId);
                    update.setUpdateBy(UserContext.getUserName() != null ? UserContext.getUserName() : "event-consumer");
                    update.setUpdateTime(LocalDateTime.now());
                    paymentRequestService.updateById(update);
                }
                log.info("付款申请 {} 工作流启动成功，流程实例ID: {}", event.getPaymentNo(), instanceId);
                return;
            }
            log.warn("付款申请 {} 工作流启动返回异常: {}", event.getPaymentNo(), result != null ? result.getMsg() : "null");
            throw new IllegalStateException("workflow start returned non-200");
        } catch (Exception e) {
            log.error("付款申请 {} 异步启动工作流失败", event.getPaymentNo(), e);
            workflowFailureHelper.handleWorkflowStartFailure(
                    OaBusinessTypes.PAYMENT_REQUEST, event.getPaymentId(), event.getPaymentNo(),
                    event.getUserName(), event.getUserId(), e);
        }
    }

    @SuppressWarnings("unchecked")
    private String extractInstanceId(Object data) {
        if (data instanceof Map) {
            Map<String, Object> dataMap = (Map<String, Object>) data;
            Object instanceId = dataMap.get("processInstanceId");
            if (instanceId == null) {
                instanceId = dataMap.get("instanceId");
            }
            return instanceId != null ? String.valueOf(instanceId) : null;
        }
        return data instanceof String ? (String) data : null;
    }
}
