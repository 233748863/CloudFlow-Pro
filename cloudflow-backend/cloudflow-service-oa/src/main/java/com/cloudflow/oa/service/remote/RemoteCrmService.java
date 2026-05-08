package com.cloudflow.oa.service.remote;

import com.cloudflow.common.core.domain.R;
import lombok.Data;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;

import java.math.BigDecimal;
import java.time.LocalDate;

@FeignClient(
        name = "cloudflow-service-crm",
        fallbackFactory = RemoteCrmFallbackFactory.class
)
public interface RemoteCrmService {

    @PostMapping("/inner/crm/receivable/{id}/invoice-status")
    R<Void> syncReceivableInvoiceStatus(@RequestHeader("X-Inner-Call") String innerCall,
                                        @RequestHeader("X-From-Service") String fromService,
                                        @PathVariable("id") Long receivableId,
                                        @RequestBody InvoiceStatusSyncRequest request);

    @Data
    class InvoiceStatusSyncRequest {
        private Long invoiceId;
        private String invoiceStatus;
        private BigDecimal grossAmount;
        private BigDecimal totalWriteoffAmount;
        private LocalDate writeoffDate;
    }
}
