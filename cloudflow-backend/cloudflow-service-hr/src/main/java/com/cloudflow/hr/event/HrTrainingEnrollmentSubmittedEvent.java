package com.cloudflow.hr.event;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class HrTrainingEnrollmentSubmittedEvent {

    private Long enrollmentId;

    private Long sessionId;

    private LocalDateTime submittedAt;
}
