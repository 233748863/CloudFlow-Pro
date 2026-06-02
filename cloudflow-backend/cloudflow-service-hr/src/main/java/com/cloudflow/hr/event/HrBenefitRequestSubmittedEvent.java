package com.cloudflow.hr.event;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class HrBenefitRequestSubmittedEvent {

    private Long requestId;

    private String requestNo;

    private LocalDateTime submittedAt;
}
