package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.crm.service.remote.RemoteOaService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 回款确认后的自动发票绑定：
 * <ul>
 *     <li>若事件携带 invoiceId，则通过 OA 的 bindInvoice 将发票与回款/客户/合同重新绑定；</li>
 *     <li>invoiceId 缺失则跳过——后续由 OA 财务发起核销回写。</li>
 * </ul>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class CrmReceivableConfirmedEventHandler {

    private final RemoteOaService remoteOaService;

    public void handle(Map<String, String> body) {
        Long invoiceId = parseLong(body.get("invoiceId"));
        Long receivableId = parseLong(body.get("receivableId"));
        if (invoiceId == null || receivableId == null) {
            log.debug("ReceivableConfirmed 缺少 invoiceId 或 receivableId，跳过自动核销: receivableId={}, invoiceId={}",
                    receivableId, invoiceId);
            return;
        }
        RemoteOaService.InvoiceBindRequest request = new RemoteOaService.InvoiceBindRequest();
        request.setReceivableId(receivableId);
        request.setCustomerId(parseLong(body.get("customerId")));
        request.setCustomerName(normalize(body.get("customerName")));
        request.setContractId(parseLong(body.get("contractId")));
        request.setContractNo(normalize(body.get("contractNo")));
        try {
            R<Void> response = remoteOaService.bindInvoice(invoiceId, request);
            if (response == null || !response.isSuccess()) {
                log.warn("回款确认后自动绑定发票失败: receivableId={}, invoiceId={}, msg={}",
                        receivableId, invoiceId, response != null ? response.getMsg() : "no response");
            } else {
                log.info("回款确认后自动绑定发票成功: receivableId={}, invoiceId={}", receivableId, invoiceId);
            }
        } catch (Exception ex) {
            log.error("回款确认后自动绑定发票异常: receivableId={}, invoiceId={}", receivableId, invoiceId, ex);
        }
    }

    private Long parseLong(String value) {
        String v = normalize(value);
        if (v == null || v.isBlank()) {
            return null;
        }
        try {
            return Long.parseLong(v);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String normalize(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.length() >= 2 && trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
            trimmed = trimmed.substring(1, trimmed.length() - 1);
        }
        return trimmed;
    }
}
