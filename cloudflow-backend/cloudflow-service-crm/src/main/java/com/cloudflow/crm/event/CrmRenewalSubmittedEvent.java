package com.cloudflow.crm.event;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class CrmRenewalSubmittedEvent {

    private Long renewalId;

    private LocalDateTime submittedAt;
}
