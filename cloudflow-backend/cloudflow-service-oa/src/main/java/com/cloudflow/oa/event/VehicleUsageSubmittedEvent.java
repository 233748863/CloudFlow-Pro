package com.cloudflow.oa.event;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class VehicleUsageSubmittedEvent {

    private Long usageId;

    private Long applicantId;

    private LocalDateTime submittedAt;
}
