package com.cloudflow.crm.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.crm.service.impl.CrmProfileReportService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequiredArgsConstructor
@RequestMapping("/profile-report")
public class CrmProfileReportController {
    private final CrmProfileReportService service;
    @GetMapping
    @SaCheckPermission("crm:profile:report")
    public R<Map<String, Object>> report(@RequestParam(defaultValue = "territory") String dimension) { return R.ok(service.report(dimension)); }
}
