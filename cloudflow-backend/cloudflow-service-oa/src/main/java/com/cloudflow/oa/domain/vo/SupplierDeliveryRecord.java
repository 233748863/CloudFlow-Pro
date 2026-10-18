package com.cloudflow.oa.domain.vo;

import lombok.Data;
import java.time.LocalDate;

@Data
public class SupplierDeliveryRecord {
    private Long receiptId;
    private Long purchaseId;
    private LocalDate actualDate;
    private LocalDate expectedDate;
}
