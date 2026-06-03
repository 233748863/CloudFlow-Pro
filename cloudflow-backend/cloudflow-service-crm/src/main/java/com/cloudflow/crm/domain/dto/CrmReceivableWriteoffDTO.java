package com.cloudflow.crm.domain.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
public class CrmReceivableWriteoffDTO {

    private BigDecimal amount;

    private LocalDate writeoffDate;

    private String remark;
}
