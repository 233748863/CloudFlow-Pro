package com.cloudflow.oa.event;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
public class BusinessTripSubmittedEvent {

    private Long tripId;

    private String tripNo;

    private Long userId;

    private String userName;

    private String deptName;

    private String destination;

    private BigDecimal tripDays;

    private BigDecimal estimatedCost;

    private LocalDate startDate;

    private LocalDate endDate;

    private String transportType;

    private String reason;

    private LocalDateTime submittedAt;
}
