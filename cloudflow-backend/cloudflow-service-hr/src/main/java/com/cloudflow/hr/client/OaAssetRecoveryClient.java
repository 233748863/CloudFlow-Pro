package com.cloudflow.hr.client;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.fallback.OaAssetRecoveryClientFallback;
import com.cloudflow.hr.client.vo.HrEmployeeAssetRecovery;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

@FeignClient(name = "cloudflow-service-oa", contextId = "hrOaAssetRecoveryClient", fallback = OaAssetRecoveryClientFallback.class)
public interface OaAssetRecoveryClient {
    @GetMapping("/inner/oa/asset/return-reminder")
    R<com.cloudflow.hr.client.vo.HrAssetReturnReminder> reminder(@RequestParam("employeeId") Long employeeId, @RequestParam("userId") Long userId,
            @RequestParam("settlementId") Long settlementId, @RequestParam("assetId") Long assetId);

    @org.springframework.web.bind.annotation.PostMapping("/inner/oa/asset/return-reminder")
    R<com.cloudflow.hr.client.vo.HrAssetReturnReminder> sendReminder(@org.springframework.web.bind.annotation.RequestBody com.cloudflow.hr.client.vo.HrAssetReturnReminder.Request input);

    @GetMapping("/inner/oa/asset/employee-recovery")
    R<HrEmployeeAssetRecovery> outstanding(@RequestParam("employeeId") Long employeeId);
}
