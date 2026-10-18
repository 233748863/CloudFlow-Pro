package com.cloudflow.crm.mapper;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import lombok.Data;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmInvoiceReceiptMapper {
    @Data
    class Invoice {
        private Long invoiceId;
        private Long receivableId;
        private Long customerId;
        private Long contractId;
        private String status;
        private Integer version;
        private BigDecimal grossAmount;
    }
    @Data
    class Writeoff {
        private Long writeoffId;
        private Long invoiceId;
        private Long businessId;
        private String businessType;
        private BigDecimal writeoffAmount;
        private LocalDate writeoffDate;
    }
    Invoice readInvoice(@Param("id") Long id, @Param("tenantId") Long tenantId);
    Writeoff readWriteoff(@Param("id") Long id, @Param("tenantId") Long tenantId);
    List<Long> boundInvoices(@Param("id") Long id, @Param("tenantId") Long tenantId);
    BigDecimal pendingAmount(@Param("id") Long id, @Param("tenantId") Long tenantId);
}
