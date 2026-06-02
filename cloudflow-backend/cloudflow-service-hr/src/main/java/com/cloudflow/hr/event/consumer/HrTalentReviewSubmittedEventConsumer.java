package com.cloudflow.hr.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.hr.domain.entity.HrTalentReview;
import com.cloudflow.hr.event.HrTalentReviewSubmittedEvent;
import com.cloudflow.hr.mapper.HrTalentReviewMapper;
import com.cloudflow.hr.service.impl.HrTalentReviewServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class HrTalentReviewSubmittedEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final HrTalentReviewMapper reviewMapper;
    private final HrTalentReviewServiceImpl reviewService;

    @Override
    public String eventType() {
        return "HR_TALENT_REVIEW_SUBMITTED";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        HrTalentReviewSubmittedEvent event = objectMapper.readValue(envelope.getPayload(), HrTalentReviewSubmittedEvent.class);
        HrTalentReview review = reviewMapper.selectById(event.getReviewId());
        if (review == null) {
            log.warn("skip hr talent review workflow start, review not found, reviewId={}, eventId={}", event.getReviewId(), envelope.getEventId());
            return;
        }
        if (review.getProcessInstanceId() != null && !review.getProcessInstanceId().isBlank()) {
            log.info("skip hr talent review workflow start, instance already exists, reviewId={}, instanceId={}",
                    review.getId(), review.getProcessInstanceId());
            return;
        }
        reviewService.startTalentReviewWorkflow(review);
    }
}
