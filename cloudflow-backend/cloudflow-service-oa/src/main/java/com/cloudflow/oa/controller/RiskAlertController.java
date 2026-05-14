package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.OaRiskAlert;
import com.cloudflow.oa.domain.dto.OaRiskAssignDTO;
import com.cloudflow.oa.domain.dto.OaRiskStatsDTO;
import com.cloudflow.oa.domain.dto.OaRiskStatusDTO;
import com.cloudflow.oa.service.IOaRiskAlertService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/**
 * 风险中心 Controller。
 */
@RestController
@RequestMapping("/risk")
@RequiredArgsConstructor
@SaCheckLogin
public class RiskAlertController {

    private final IOaRiskAlertService riskAlertService;

    @GetMapping("/list")
    @SaCheckPermission("admin:risk:list")
    public R<PageResult<OaRiskAlert>> list(OaRiskAlert query, PageQuery pageQuery) {
        return R.ok(riskAlertService.queryPage(query, pageQuery));
    }

    @GetMapping("/stats")
    @SaCheckPermission("admin:risk:list")
    public R<OaRiskStatsDTO> stats() {
        return R.ok(riskAlertService.getStats());
    }

    @SysLog("人工标记风险")
    @PostMapping("/manual")
    @SaCheckPermission("admin:risk:add")
    public R<Void> manual(@RequestBody OaRiskAlert risk) {
        try {
            return R.result(riskAlertService.createManualRisk(risk));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("更新风险状态")
    @PutMapping("/{id}/status")
    @SaCheckPermission("admin:risk:status")
    public R<Void> updateStatus(@PathVariable("id") Long id, @RequestBody OaRiskStatusDTO dto) {
        try {
            return R.result(riskAlertService.updateRiskStatus(id, dto));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("指派风险")
    @PutMapping("/{id}/assign")
    @SaCheckPermission("admin:risk:assign")
    public R<Void> assign(@PathVariable("id") Long id, @RequestBody OaRiskAssignDTO dto) {
        try {
            return R.result(riskAlertService.assignRisk(id, dto));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }
}
