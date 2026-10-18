package com.cloudflow.crm.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.CrmOpportunityStageHistory;
import com.cloudflow.crm.domain.CrmSalesStage;
import com.cloudflow.crm.domain.dto.CrmOpportunityItemsRequest;
import com.cloudflow.crm.domain.dto.CrmOpportunityReopenRequest;
import com.cloudflow.crm.service.opportunity.CrmOpportunityReopenService;
import com.cloudflow.crm.service.opportunity.CrmOpportunityItemService;
import com.cloudflow.crm.service.opportunity.CrmOpportunityStageService;
import com.cloudflow.crm.service.opportunity.CrmSalesStageService;
import com.cloudflow.crm.service.opportunity.CrmStageAnalysisService;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.format.annotation.DateTimeFormat;

@RestController
@RequestMapping("/opportunity")
@RequiredArgsConstructor
public class CrmOpportunityDetailController {
    private final CrmOpportunityItemService items;
    private final CrmOpportunityStageService histories;
    private final CrmSalesStageService stages;
    private final CrmStageAnalysisService analysis;
    private final CrmOpportunityReopenService reopening;

    @GetMapping("/{id}/stage-reopen")
    @SaCheckPermission("crm:opportunity:stage-reopen")
    public R<CrmOpportunityReopenService.View> inspectReopen(@PathVariable Long id) { return R.ok(reopening.inspect(id)); }

    @PostMapping("/{id}/stage-reopen")
    @SysLog("恢复终态商机并冲减原赢单业绩")
    @RepeatSubmit
    @SaCheckPermission("crm:opportunity:stage-reopen")
    public R<CrmOpportunityReopenService.Receipt> restore(@PathVariable Long id, @RequestBody CrmOpportunityReopenRequest request) {
        return R.ok(reopening.restore(id, request));
    }

    @GetMapping("/stage-analysis")
    @SaCheckPermission("crm:opportunity:stage-analysis")
    public R<CrmStageAnalysisService.Report> analysis(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(required = false) String currency, @RequestParam(required = false) Long ownerId) {
        return R.ok(analysis.report(startDate, endDate, currency, ownerId));
    }

    @GetMapping("/stage-options")
    @SaCheckPermission("crm:opportunity:list")
    public R<List<CrmSalesStage>> options() { return R.ok(stages.options()); }

    @GetMapping("/{id}/items")
    @SaCheckPermission("crm:opportunity:list")
    public R<CrmOpportunityItemService.View> items(@PathVariable Long id) { return R.ok(items.list(id)); }

    @PutMapping("/{id}/items")
    @SysLog("保存商机产品明细")
    @RepeatSubmit
    @SaCheckPermission("crm:opportunity:items")
    public R<CrmOpportunityItemService.View> saveItems(@PathVariable Long id, @RequestBody CrmOpportunityItemsRequest request) { return R.ok(items.save(id, request)); }

    @GetMapping("/{id}/stage-history")
    @SaCheckPermission("crm:opportunity:list")
    public R<PageResult<CrmOpportunityStageHistory>> history(@PathVariable Long id, PageQuery page) { return R.ok(histories.history(id, page)); }
}
