package com.cloudflow.common.core.domain;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.LocalDate;
import java.util.List;
import lombok.Data;

/** Explicit customer-facing projection. Monetary values never pass through floating point. */
@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PortalFinanceVO {
    private String recordId;
    private String kind;
    private String number;
    private String invoiceCode;
    private String invoiceType;
    private String plannedAmount;
    private String receivedAmount;
    private String outstandingAmount;
    private String grossAmount;
    private String taxAmount;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate dueDate;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate receivedDate;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate invoiceDate;
    private String status;
    private List<PortalFinanceAttachment> attachments = List.of();
}
