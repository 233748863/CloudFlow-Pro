package com.cloudflow.workflow.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.report.ReportQuery;
import com.cloudflow.common.core.report.ReportResult;
import com.cloudflow.common.core.report.ReportValidation;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.workflow.service.WorkflowReportService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/workflow/report")
@RequiredArgsConstructor
public class WorkflowReportController {
    private final WorkflowReportService service;
    private final ObjectMapper objectMapper;

    @PostMapping("/{code}/query")
    @Inner(allowedServices = "cloudflow-auth")
    public R<ReportResult> query(@PathVariable String code, @RequestBody JsonNode input) {
        return R.ok(service.query(code, ReportValidation.read(objectMapper, input, ReportQuery.class)));
    }
}
