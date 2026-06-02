package com.cloudflow.hr.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.hr.domain.entity.HrTrainingEnrollment;
import com.cloudflow.hr.event.HrTrainingEnrollmentSubmittedEvent;
import com.cloudflow.hr.mapper.HrTrainingEnrollmentMapper;
import com.cloudflow.hr.service.impl.HrTrainingEnrollmentServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class HrTrainingEnrollmentSubmittedEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final HrTrainingEnrollmentMapper enrollmentMapper;
    private final HrTrainingEnrollmentServiceImpl trainingEnrollmentService;

    @Override
    public String eventType() {
        return "HR_TRAINING_ENROLLMENT_SUBMITTED";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        HrTrainingEnrollmentSubmittedEvent event = objectMapper.readValue(envelope.getPayload(), HrTrainingEnrollmentSubmittedEvent.class);
        HrTrainingEnrollment enrollment = enrollmentMapper.selectById(event.getEnrollmentId());
        if (enrollment == null) {
            log.warn("skip hr training enrollment workflow start, enrollment not found, enrollmentId={}, eventId={}", event.getEnrollmentId(), envelope.getEventId());
            return;
        }
        if (enrollment.getProcessInstanceId() != null && !enrollment.getProcessInstanceId().isBlank()) {
            log.info("skip hr training enrollment workflow start, instance already exists, enrollmentId={}, instanceId={}",
                    enrollment.getId(), enrollment.getProcessInstanceId());
            return;
        }
        trainingEnrollmentService.startTrainingEnrollmentWorkflow(enrollment);
    }
}
