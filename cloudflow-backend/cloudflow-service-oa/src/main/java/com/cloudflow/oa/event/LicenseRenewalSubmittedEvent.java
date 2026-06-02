package com.cloudflow.oa.event;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class LicenseRenewalSubmittedEvent {

    private Long renewalId;

    private String renewalNo;

    private Long applicantId;

    private String applicantName;

    private LocalDateTime submittedAt;
}
