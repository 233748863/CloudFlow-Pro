package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.report.PreparedReportQuery;
import com.cloudflow.common.core.report.ReportDataset;
import com.cloudflow.common.core.report.ReportQuery;
import com.cloudflow.common.core.report.ReportRegistry;
import com.cloudflow.common.core.report.ReportResult;
import com.cloudflow.common.core.report.ReportRow;
import com.cloudflow.common.core.report.ReportValidation;
import com.cloudflow.common.datascope.DataScopeHandle;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.common.report.ReportDataScope;
import com.cloudflow.common.security.report.ReportAccess;
import com.cloudflow.oa.mapper.OaReportMapper;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class OaReportService {
    private final OaReportMapper mapper;
    private final DataScopeHandle scopeHandle;

    public ReportResult query(String code, ReportQuery input) {
        ReportDataset dataset = ReportRegistry.require(code);
        ReportAccess.requireDataset(dataset);
        PreparedReportQuery query = ReportValidation.prepare(dataset, input, LocalDate.now());
        ReportDataScope scope = ReportDataScope.resolve(scopeHandle, DataScopeUtils.listScope("dept_id", "OA_EXPENSE".equals(code) ? "user_id" : "owner_id"));
        List<ReportRow> rows = switch (code) {
            case "OA_BUDGET" -> mapper.budget(UserContext.getTenantId(), scope, query);
            case "OA_ASSET" -> mapper.assets(UserContext.getTenantId(), query);
            case "OA_EXPENSE" -> mapper.expense(UserContext.getTenantId(), scope, query);
            default -> throw ReportValidation.invalid("该服务不提供此数据集");
        };
        return ReportResult.from(dataset, query, rows);
    }
}
