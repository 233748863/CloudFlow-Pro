package com.cloudflow.auth.service.report;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.report.ReportQuery;
import com.cloudflow.common.core.report.ReportResult;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

public interface ReportRemoteApi {
    @PostMapping("/{code}/query")
    R<ReportResult> query(@PathVariable("code") String code, @RequestBody ReportQuery input);
}
