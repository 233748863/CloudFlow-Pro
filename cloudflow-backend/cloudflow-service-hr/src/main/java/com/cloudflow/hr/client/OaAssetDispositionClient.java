package com.cloudflow.hr.client;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.fallback.OaAssetDispositionClientFallback;
import com.cloudflow.hr.client.vo.HrEmployeeAssetDisposition;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

@FeignClient(name = "cloudflow-service-oa", contextId = "hrOaAssetDispositionClient", fallback = OaAssetDispositionClientFallback.class)
public interface OaAssetDispositionClient {
    @GetMapping("/inner/oa/asset/employee-disposition")
    R<HrEmployeeAssetDisposition> inspect(@RequestParam("employeeId") Long employeeId, @RequestParam("assetId") Long assetId);
}
