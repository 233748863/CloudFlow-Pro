package com.cloudflow.crm.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.*;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.*;
import com.cloudflow.crm.service.impl.CrmLostAnalysisService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/lost-analysis")
@RequiredArgsConstructor
public class CrmLostAnalysisController {
    private final CrmLostAnalysisService service;

    @GetMapping("/reasons")
    @SaCheckPermission("crm:lost:list")
    public R<PageResult<CrmLostReason>> reasons(PageQuery page) { return R.ok(service.reasons(page)); }

    @PostMapping("/reason")
    @RepeatSubmit
    @SysLog("维护CRM丢单原因")
    @SaCheckPermission("crm:lost:edit")
    public R<Long> saveReason(@RequestBody CrmLostReason reason) { return R.ok(service.saveReason(reason)); }

    @GetMapping("/competitors")
    @SaCheckPermission("crm:lost:list")
    public R<PageResult<CrmCompetitor>> competitors(PageQuery page) { return R.ok(service.competitors(page)); }

    @PostMapping("/competitor")
    @RepeatSubmit
    @SysLog("维护CRM竞争对手")
    @SaCheckPermission("crm:lost:edit")
    public R<Long> saveCompetitor(@RequestBody CrmCompetitor competitor) { return R.ok(service.saveCompetitor(competitor)); }

    @GetMapping("/opportunity/{id}")
    @SaCheckPermission("crm:opportunity:list")
    public R<List<CrmOpportunityLostDetail>> details(@PathVariable Long id) { return R.ok(service.details(id)); }

    @GetMapping("/report")
    @SaCheckPermission("crm:lost:report")
    public R<CrmLostAnalysisService.Report> report(@RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate start,
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate end) { return R.ok(service.report(start, end)); }
}
