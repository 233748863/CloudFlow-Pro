package com.cloudflow.hr.event;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class HrTalentReviewSubmittedEvent {

    private Long reviewId;

    private String reviewNo;

    private LocalDateTime submittedAt;
}
