package com.cloudflow.oa.event;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class SealApplicationSubmittedEvent {

    private Long applicationId;

    private String applicationNo;

    private Long userId;

    private String userName;

    private LocalDateTime submittedAt;
}
