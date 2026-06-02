package com.cloudflow.hr.event;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class HrCertificateRequestSubmittedEvent {

    private Long requestId;

    private String requestNo;

    private LocalDateTime submittedAt;
}
