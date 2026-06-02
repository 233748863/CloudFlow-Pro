package com.cloudflow.hr.event;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class HrLaborDisputeSubmittedEvent {

    private Long disputeId;

    private String disputeNo;

    private LocalDateTime submittedAt;
}
