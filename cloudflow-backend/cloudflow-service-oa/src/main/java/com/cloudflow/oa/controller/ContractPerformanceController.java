package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.dto.ContractStartDateDTO;
import com.cloudflow.oa.domain.vo.OaContractPerformanceView;
import com.cloudflow.oa.service.impl.OaContractPerformanceService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/contract")
@RequiredArgsConstructor
public class ContractPerformanceController {
    private final OaContractPerformanceService performance;

    @GetMapping("/{id}/performance")
    @SaCheckPermission("oa:contract:list")
    public R<OaContractPerformanceView> performance(@PathVariable Long id) {
        try { return R.ok(performance.read(id)); }
        catch (IllegalArgumentException failure) { return R.fail(failure.getMessage()); }
    }

    @SysLog("补齐合同开始日期")
    @RepeatSubmit
    @PutMapping("/{id}/start-date")
    @SaCheckPermission("oa:contract:edit")
    public R<OaContractPerformanceView> completeStartDate(@PathVariable Long id, @RequestBody ContractStartDateDTO request) {
        try { return R.ok(performance.completeStartDate(id, request)); }
        catch (IllegalArgumentException failure) { return R.fail(failure.getMessage()); }
    }
}
