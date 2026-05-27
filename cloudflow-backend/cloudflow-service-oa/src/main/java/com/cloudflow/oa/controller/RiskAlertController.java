package com.cloudflow.oa.controller;

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
public class RiskAlertController {

    private final IOaRiskAlertService oaRiskAlertService;

    @GetMapping("/list")
    @SaCheckPermission("oa:risk:list")
    public R<PageResult<OaRiskAlert>> list(OaRiskAlert query, PageQuery pageQuery) {
        return R.ok(oaRiskAlertService.queryPage(query, pageQuery));
    }

    @GetMapping("/stats")
    @SaCheckPermission("oa:risk:list")
    public R<OaRiskStatsDTO> stats() {
        return R.ok(oaRiskAlertService.getStats());
    }

    @SysLog("人工标记风险")
    @PostMapping("/manual")
    @SaCheckPermission("oa:risk:add")
    public R<Void> manual(@RequestBody OaRiskAlert risk) {
        try {
            return R.result(oaRiskAlertService.createManualRisk(risk));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("更新风险状态")
    @PutMapping("/{id}/status")
    @SaCheckPermission("oa:risk:status")
    public R<Void> updateStatus(@PathVariable("id") Long id, @RequestBody OaRiskStatusDTO dto) {
        try {
            return R.result(oaRiskAlertService.updateRiskStatus(id, dto));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("指派风险")
    @PutMapping("/{id}/assign")
    @SaCheckPermission("oa:risk:assign")
    public R<Void> assign(@PathVariable("id") Long id, @RequestBody OaRiskAssignDTO dto) {
        try {
            return R.result(oaRiskAlertService.assignRisk(id, dto));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }
}

