package com.cloudflow.oa.event.consumer;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.oa.constant.OaBusinessTypes;
import com.cloudflow.oa.domain.BusinessTrip;
import com.cloudflow.oa.domain.dto.InternalWorkflowStartDTO;
import com.cloudflow.oa.event.BusinessTripSubmittedEvent;
import com.cloudflow.oa.service.impl.BusinessTripServiceImpl;
import com.cloudflow.oa.service.impl.OaWorkflowFailureHelper;
import com.cloudflow.oa.service.remote.RemoteWorkflowService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class BusinessTripSubmittedEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final RemoteWorkflowService remoteWorkflowService;
    private final BusinessTripServiceImpl businessTripService;
    private final OaWorkflowFailureHelper workflowFailureHelper;

    @Override
    public String eventType() {
        return "BUSINESS_TRIP_SUBMITTED";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        BusinessTripSubmittedEvent event = objectMapper.readValue(envelope.getPayload(), BusinessTripSubmittedEvent.class);
        BusinessTrip trip = businessTripService.getById(event.getTripId());
        if (trip == null) {
            log.warn("skip trip workflow start, trip not found, tripId={}, eventId={}", event.getTripId(), envelope.getEventId());
            return;
        }
        if (trip.getInstanceId() != null && !trip.getInstanceId().isBlank()) {
            log.info("skip trip workflow start, instance already exists, tripId={}, instanceId={}", trip.getId(), trip.getInstanceId());
            return;
        }
        startWorkflow(trip, event);
    }

    private void startWorkflow(BusinessTrip trip, BusinessTripSubmittedEvent event) {
        try {
            InternalWorkflowStartDTO req = new InternalWorkflowStartDTO();
            req.setProcessDefKey("business_trip");
            req.setBusinessKey("BUSINESS_TRIP:" + trip.getId());
            req.setStartUserId(event.getUserId());
            req.setStartUserName(event.getUserName());
            Map<String, Object> variables = new HashMap<>();
            variables.put("tripId", trip.getId());
            variables.put("tripNo", event.getTripNo());
            variables.put("destination", event.getDestination());
            variables.put("tripDays", event.getTripDays());
            variables.put("estimatedCost", event.getEstimatedCost());
            variables.put("userId", event.getUserId());
            variables.put("userName", event.getUserName());
            variables.put("startDate", event.getStartDate() != null
                    ? DateTimeFormatter.ofPattern("yyyy-MM-dd").format(event.getStartDate()) : null);
            variables.put("endDate", event.getEndDate() != null
                    ? DateTimeFormatter.ofPattern("yyyy-MM-dd").format(event.getEndDate()) : null);
            variables.put("transportType", event.getTransportType());
            variables.put("reason", event.getReason());
            variables.put("deptName", event.getDeptName());
            WorkflowCallbackConstants.applyCallbackMetadata(
                    variables,
                    OaBusinessTypes.BUSINESS_TRIP,
                    trip.getId(),
                    event.getTripNo(),
                    "workflow:stream:approval-callback:oa"
            );
            req.setVariables(variables);
            R<?> result = remoteWorkflowService.startProcessInternal(req);
            if (result != null && result.getCode() == 200 && result.getData() != null) {
                String instanceId = extractInstanceId(result.getData());
                if (instanceId != null) {
                    BusinessTrip update = new BusinessTrip();
                    update.setId(trip.getId());
                    update.setInstanceId(instanceId);
                    update.setUpdateBy(UserContext.getUserName() != null ? UserContext.getUserName() : "event-consumer");
                    update.setUpdateTime(LocalDateTime.now());
                    businessTripService.updateById(update);
                }
                log.info("出差申请 {} 工作流启动成功，流程实例ID: {}", event.getTripNo(), instanceId);
                return;
            }
            log.warn("出差申请 {} 工作流启动返回异常: {}", event.getTripNo(), result != null ? result.getMsg() : "null");
            throw new IllegalStateException("workflow start returned non-200");
        } catch (Exception e) {
            log.error("出差申请 {} 异步启动工作流失败", event.getTripNo(), e);
            workflowFailureHelper.handleWorkflowStartFailure(
                    OaBusinessTypes.BUSINESS_TRIP, event.getTripId(), event.getTripNo(),
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
