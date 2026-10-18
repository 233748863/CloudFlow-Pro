package com.cloudflow.crm.service.remote;

import com.cloudflow.common.core.domain.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import java.util.List;

@FeignClient(name = "cloudflow-service-oa", contextId = "crmContractOriginClient", path = "/inner/oa/crm-contracts")
public interface CrmContractOriginClient {
    record Origin(Long contractId, Long customerId, String sourceType, Long sourceId, String currency, String status) { }
    @PostMapping("/origins")
    R<List<Origin>> origins(@RequestBody List<Long> contractIds);
}
