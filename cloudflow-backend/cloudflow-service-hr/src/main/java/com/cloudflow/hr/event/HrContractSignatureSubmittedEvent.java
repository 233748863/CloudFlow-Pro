package com.cloudflow.hr.event;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class HrContractSignatureSubmittedEvent {

    private Long signatureId;

    private Long contractId;

    private LocalDateTime submittedAt;
}
