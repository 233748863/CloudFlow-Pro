package com.cloudflow.auth.event;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class DictChangeApprovalSubmittedEvent {

    private Long approvalId;

    private String processDefKey;

    private LocalDateTime submittedAt;
}
