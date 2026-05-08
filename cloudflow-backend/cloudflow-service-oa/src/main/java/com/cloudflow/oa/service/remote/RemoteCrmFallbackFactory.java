package com.cloudflow.oa.service.remote;

import com.cloudflow.common.core.domain.R;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.openfeign.FallbackFactory;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class RemoteCrmFallbackFactory implements FallbackFactory<RemoteCrmService> {

    @Override
    public RemoteCrmService create(Throwable cause) {
        log.error("OA 调用 CRM 服务失败: {}", cause.getMessage());
        return new RemoteCrmService() {
            @Override
            public R<Void> syncReceivableInvoiceStatus(String innerCall, String fromService, Long receivableId, InvoiceStatusSyncRequest request) {
                log.error("OA 同步 CRM 回款发票状态失败: receivableId={}, invoiceId={}",
                        receivableId, request != null ? request.getInvoiceId() : null);
                return R.fail("CRM 服务暂时不可用，无法同步回款发票状态");
            }
        };
    }
}
