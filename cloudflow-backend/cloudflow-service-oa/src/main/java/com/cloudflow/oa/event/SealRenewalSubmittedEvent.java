package com.cloudflow.oa.event;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class SealRenewalSubmittedEvent {

    private Long renewalId;

    private String renewalNo;

    private Long applicantId;

    private String applicantName;

    private LocalDateTime submittedAt;
}
