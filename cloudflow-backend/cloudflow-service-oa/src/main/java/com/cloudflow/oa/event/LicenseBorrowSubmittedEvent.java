package com.cloudflow.oa.event;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class LicenseBorrowSubmittedEvent {

    private Long borrowId;

    private String borrowNo;

    private Long userId;

    private String userName;

    private LocalDateTime submittedAt;
}
