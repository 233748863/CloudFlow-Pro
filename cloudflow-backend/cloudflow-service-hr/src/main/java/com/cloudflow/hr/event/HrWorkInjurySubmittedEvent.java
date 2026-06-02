package com.cloudflow.hr.event;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class HrWorkInjurySubmittedEvent {

    private Long injuryId;

    private String injuryNo;

    private LocalDateTime submittedAt;
}
