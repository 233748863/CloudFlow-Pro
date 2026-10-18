package com.cloudflow.crm.domain.dto;

import lombok.Data;
import org.springframework.format.annotation.DateTimeFormat;
import java.time.LocalDate;

@Data
public class CrmSlaReportQuery {
    private Long policyId;
    private String severity;
    private Long ownerId;
    private String groupBy = "POLICY";
    @DateTimeFormat(pattern = "yyyy-MM-dd")
    private LocalDate start;
    @DateTimeFormat(pattern = "yyyy-MM-dd")
    private LocalDate end;
}
