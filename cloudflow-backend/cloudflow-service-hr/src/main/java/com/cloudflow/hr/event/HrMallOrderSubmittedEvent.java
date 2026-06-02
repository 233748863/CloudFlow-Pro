package com.cloudflow.hr.event;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class HrMallOrderSubmittedEvent {

    private Long orderId;

    private String orderNo;

    private LocalDateTime submittedAt;
}
