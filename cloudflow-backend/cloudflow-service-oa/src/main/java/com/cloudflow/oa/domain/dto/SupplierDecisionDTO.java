package com.cloudflow.oa.domain.dto;

import lombok.Data;
import java.time.LocalDate;

@Data
public class SupplierDecisionDTO {
    private String action;
    private String reason;
    private LocalDate expireDate;
}
