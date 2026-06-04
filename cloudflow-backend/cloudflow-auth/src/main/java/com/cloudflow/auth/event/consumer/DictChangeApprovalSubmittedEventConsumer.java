package com.cloudflow.auth.event.consumer;

import com.cloudflow.auth.domain.SysDictChangeApproval;
import com.cloudflow.auth.event.DictChangeApprovalSubmittedEvent;
import com.cloudflow.auth.service.impl.SysDictTypeServiceImpl;
import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class DictChangeApprovalSubmittedEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final SysDictTypeServiceImpl sysDictTypeService;

    @Override
    public String eventType() {
        return "DICT_CHANGE_APPROVAL_SUBMITTED";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        DictChangeApprovalSubmittedEvent event = objectMapper.readValue(
                envelope.getPayload(), DictChangeApprovalSubmittedEvent.class);
        SysDictChangeApproval approval = sysDictTypeService.getDictChangeApprovalById(event.getApprovalId());
        if (approval == null) {
            log.warn("skip dict change workflow start, approval not found, approvalId={}, eventId={}",
                    event.getApprovalId(), envelope.getEventId());
            return;
        }
        if (approval.getInstanceId() != null && !approval.getInstanceId().isBlank()) {
            log.info("skip dict change workflow start, instance already exists, approvalId={}, instanceId={}",
                    approval.getApprovalId(), approval.getInstanceId());
            return;
        }
        sysDictTypeService.startDictChangeApprovalWorkflow(approval, event.getProcessDefKey());
    }
}
