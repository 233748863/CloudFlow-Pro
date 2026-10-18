package com.cloudflow.oa.mapper;

import com.cloudflow.oa.domain.OaContractTeam;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import lombok.Data;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaInvoiceReceiptMapper {
    @Data
    class Receivable {
        private Long receivableId;
        private Long tenantId;
        private Long customerId;
        private String customerName;
        private Long contractId;
        private String contractNo;
        private String receivableNo;
        private Long invoiceId;
        private Long ownerId;
        private BigDecimal plannedAmount;
        private BigDecimal receivedAmount;
        private LocalDate receivedDate;
        private Integer version;
        private String status;
        private String currency;
    }

    Receivable lockReceivable(@Param("id") Long id, @Param("tenantId") Long tenantId);
    Receivable readReceivable(@Param("id") Long id, @Param("tenantId") Long tenantId);
    String lockCurrency(@Param("id") Long id, @Param("tenantId") Long tenantId);
    List<Long> boundInvoices(@Param("id") Long id, @Param("tenantId") Long tenantId);
    BigDecimal pendingAmount(@Param("id") Long id, @Param("tenantId") Long tenantId);
    List<OaContractTeam> currentTeam(@Param("id") Long id, @Param("tenantId") Long tenantId);
}
