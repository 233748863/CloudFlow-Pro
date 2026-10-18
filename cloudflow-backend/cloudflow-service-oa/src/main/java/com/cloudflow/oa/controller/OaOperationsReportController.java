package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.service.impl.OaOperationsReportService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/reports")
@RequiredArgsConstructor
public class OaOperationsReportController {
    private final OaOperationsReportService reports;

    @GetMapping("/assets")
    @SaCheckPermission("oa:asset:report")
    public R<Map<String, List<Map<String, Object>>>> assets(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) { return R.ok(reports.assets(from, to)); }

    @GetMapping("/suppliers")
    @SaCheckPermission("oa:supplier:report")
    public R<Map<String, List<Map<String, Object>>>> suppliers(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) { return R.ok(reports.suppliers(from, to)); }

    @GetMapping("/projects")
    @SaCheckPermission({"oa:project:report", "oa:activity-cost:list"})
    public R<Map<String, List<Map<String, Object>>>> projects(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) { return R.ok(reports.projects(from, to)); }

    @GetMapping("/projects/effort")
    @SaCheckPermission("oa:project:report")
    public R<Map<String, List<Map<String, Object>>>> projectEffort(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) { return R.ok(reports.projectEffort(from, to)); }

    @GetMapping("/contracts")
    @SaCheckPermission("oa:contract:report")
    public R<Map<String, List<Map<String, Object>>>> contracts(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) { return R.ok(reports.contracts(from, to)); }

    @GetMapping("/rfqs")
    @SaCheckPermission({"oa:rfq:report", "oa:rfq:comparison"})
    public R<Map<String, List<Map<String, Object>>>> rfqs(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) { return R.ok(reports.rfqs(from, to)); }

}
