package com.cloudflow.crm.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.invoice.InvoiceReceiptSource;
import com.cloudflow.crm.service.receivable.CrmInvoiceReceiptService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class InvoiceReceiptEventConsumer implements BusinessEventConsumer {
    private final CrmInvoiceReceiptService receipts;
    @Override public String eventType() { return InvoiceReceiptSource.EVENT; }
    @Override public void consume(BusinessEventEnvelope envelope) { receipts.consume(envelope); }
}
