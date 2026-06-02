package com.cloudflow.hr.event;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class HrTalentSuccessionSubmittedEvent {

    private Long planId;

    private String planNo;

    private LocalDateTime submittedAt;
}
