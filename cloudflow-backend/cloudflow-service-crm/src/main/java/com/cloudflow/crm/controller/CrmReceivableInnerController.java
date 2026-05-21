package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.crm.domain.dto.ReceivableInvoiceSyncDTO;
import com.cloudflow.crm.service.ICrmReceivableService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/crm/receivable")
@RequiredArgsConstructor
public class CrmReceivableInnerController {

    private static final String OA_CALLERS =
            "${cloudflow.security.inner.crm.receivable-callers:cloudflow-service-oa}";

    private final ICrmReceivableService receivableService;

    @Inner(allowedServices = {OA_CALLERS})
    @PostMapping("/{id}/invoice-status")
    public R<Void> syncInvoiceStatus(@PathVariable("id") Long id,
                                     @RequestBody(required = false) ReceivableInvoiceSyncDTO syncDTO) {
        try {
            return R.result(receivableService.syncInvoiceStatus(id, syncDTO));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }
}
