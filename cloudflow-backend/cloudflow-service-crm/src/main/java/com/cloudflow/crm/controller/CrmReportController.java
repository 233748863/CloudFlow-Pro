package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.report.ReportQuery;
import com.cloudflow.common.core.report.ReportResult;
import com.cloudflow.common.core.report.ReportValidation;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.crm.service.impl.CrmReportService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/crm/report")
@RequiredArgsConstructor
public class CrmReportController {
    private final CrmReportService service;
    private final ObjectMapper objectMapper;

    @PostMapping("/{code}/query")
    @Inner(allowedServices = "cloudflow-auth")
    public R<ReportResult> query(@PathVariable String code, @RequestBody JsonNode input) {
        return R.ok(service.query(code, ReportValidation.read(objectMapper, input, ReportQuery.class)));
    }
}
