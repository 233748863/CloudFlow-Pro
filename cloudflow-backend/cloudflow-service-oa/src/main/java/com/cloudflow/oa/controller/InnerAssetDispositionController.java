package com.cloudflow.oa.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.oa.domain.vo.OaEmployeeAssetDisposition;
import com.cloudflow.oa.service.impl.OaEmployeeAssetDispositionService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/oa/asset")
@RequiredArgsConstructor
public class InnerAssetDispositionController {
    private final OaEmployeeAssetDispositionService service;
    @GetMapping("/employee-disposition")
    @Inner(allowedServices = "cloudflow-service-hr")
    public R<OaEmployeeAssetDisposition> inspect(@RequestParam Long employeeId, @RequestParam Long assetId) { return R.ok(service.inspect(employeeId, assetId)); }
}
