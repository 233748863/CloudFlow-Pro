package com.cloudflow.crm.domain.dto;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CrmEmailQuery {
    @Positive
    private Long customerId;
    @Pattern(regexp = "CUSTOMER|OPPORTUNITY|TICKET|QUOTE")
    private String bizType;
    @Positive
    private Long bizId;
    @Pattern(regexp = "OUTBOUND|INBOUND")
    private String direction;
    @Pattern(regexp = "DRAFT|QUEUED|SENDING|SENT|FAILED|UNKNOWN|MANUAL")
    private String sendStatus;
    @Size(max = 200)
    private String subject;
}
