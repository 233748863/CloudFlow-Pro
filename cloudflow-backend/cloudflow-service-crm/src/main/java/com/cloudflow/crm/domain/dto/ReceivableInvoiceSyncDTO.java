package com.cloudflow.crm.domain.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;

@Data
public class ReceivableInvoiceSyncDTO implements Serializable {
    private static final long serialVersionUID = 1L;

    private Long invoiceId;
    private String invoiceStatus;
    private BigDecimal grossAmount;
    private BigDecimal totalWriteoffAmount;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate writeoffDate;
}
