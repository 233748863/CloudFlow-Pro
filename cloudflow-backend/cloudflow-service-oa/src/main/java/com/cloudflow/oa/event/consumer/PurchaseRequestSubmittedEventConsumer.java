package com.cloudflow.oa.event.consumer;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.oa.constant.OaBusinessTypes;
import com.cloudflow.oa.domain.BizPurchaseRequest;
import com.cloudflow.oa.domain.dto.InternalWorkflowStartDTO;
import com.cloudflow.oa.event.PurchaseRequestSubmittedEvent;
import com.cloudflow.oa.service.impl.OaWorkflowFailureHelper;
import com.cloudflow.oa.service.impl.PurchaseRequestServiceImpl;
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
public class PurchaseRequestSubmittedEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final RemoteWorkflowService remoteWorkflowService;
    private final PurchaseRequestServiceImpl purchaseRequestService;
    private final OaWorkflowFailureHelper workflowFailureHelper;

    @Override
    public String eventType() {
        return "PURCHASE_REQUEST_SUBMITTED";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        PurchaseRequestSubmittedEvent event = objectMapper.readValue(envelope.getPayload(), PurchaseRequestSubmittedEvent.class);
        BizPurchaseRequest purchase = purchaseRequestService.getById(event.getPurchaseId());
        if (purchase == null) {
            log.warn("skip purchase workflow start, purchase not found, purchaseId={}, eventId={}", event.getPurchaseId(), envelope.getEventId());
            return;
        }
        if (purchase.getInstanceId() != null && !purchase.getInstanceId().isBlank()) {
            log.info("skip purchase workflow start, instance already exists, purchaseId={}, instanceId={}", purchase.getId(), purchase.getInstanceId());
            return;
        }
        startWorkflow(purchase, event);
    }

    private void startWorkflow(BizPurchaseRequest purchase, PurchaseRequestSubmittedEvent event) {
        try {
            InternalWorkflowStartDTO req = new InternalWorkflowStartDTO();
            req.setProcessDefKey("purchase_request");
            req.setBusinessKey("PURCHASE_REQUEST:" + purchase.getId());
            req.setStartUserId(event.getUserId());
            req.setStartUserName(event.getUserName());
            Map<String, Object> variables = new HashMap<>();
            variables.put("purchaseId", purchase.getId());
            variables.put("purchaseNo", event.getPurchaseNo());
            variables.put("amount", event.getTotalAmount());
            variables.put("totalAmount", event.getTotalAmount());
            variables.put("supplierName", event.getSupplierName());
            variables.put("userId", event.getUserId());
            variables.put("userName", event.getUserName());
            variables.put("deptName", event.getDeptName());
            variables.put("reason", event.getReason());
            variables.put("itemSummary", event.getItemSummary());
            WorkflowCallbackConstants.applyCallbackMetadata(
                    variables,
                    OaBusinessTypes.PURCHASE_REQUEST,
                    purchase.getId(),
                    event.getPurchaseNo(),
                    "workflow:stream:approval-callback:oa"
            );
            req.setVariables(variables);
            R<?> result = remoteWorkflowService.startProcessInternal(req);
            if (result != null && result.getCode() == 200 && result.getData() != null) {
                String instanceId = extractInstanceId(result.getData());
                if (instanceId != null) {
                    BizPurchaseRequest update = new BizPurchaseRequest();
                    update.setId(purchase.getId());
                    update.setInstanceId(instanceId);
                    update.setUpdateBy(UserContext.getUserName() != null ? UserContext.getUserName() : "event-consumer");
                    update.setUpdateTime(LocalDateTime.now());
                    purchaseRequestService.updateById(update);
                }
                log.info("采购申请 {} 工作流启动成功，流程实例ID: {}", event.getPurchaseNo(), instanceId);
                return;
            }
            log.warn("采购申请 {} 工作流启动返回异常: {}", event.getPurchaseNo(), result != null ? result.getMsg() : "null");
            throw new IllegalStateException("workflow start returned non-200");
        } catch (Exception e) {
            log.error("采购申请 {} 异步启动工作流失败", event.getPurchaseNo(), e);
            workflowFailureHelper.handleWorkflowStartFailure(
                    OaBusinessTypes.PURCHASE_REQUEST, event.getPurchaseId(), event.getPurchaseNo(),
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
