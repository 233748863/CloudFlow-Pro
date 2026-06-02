package com.cloudflow.crm.event;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class CrmApprovalSubmittedEvent {

    private Long approvalId;

    private String processDefKey;

    private LocalDateTime submittedAt;
}
