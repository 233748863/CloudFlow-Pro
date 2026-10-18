package com.cloudflow.hr.service;

import cn.dev33.satoken.stp.StpUtil;
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
import com.cloudflow.hr.mapper.HrReportMapper;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class HrReportService {
    private final HrReportMapper mapper;
    private final DataScopeHandle scopeHandle;

    public ReportResult query(String code, ReportQuery input) {
        ReportDataset dataset = ReportRegistry.require(code);
        ReportAccess.requireDataset(dataset);
        PreparedReportQuery query = ReportValidation.prepare(dataset, input, LocalDate.now());
        ReportDataScope scope = "HR_LEAVE".equals(code) && !StpUtil.hasPermission("hr:leave:list")
                ? ReportDataScope.self() : ReportDataScope.resolve(scopeHandle, DataScopeUtils.listScope("dept_id", "user_id"));
        List<ReportRow> rows = switch (code) {
            case "HR_ATTENDANCE" -> mapper.attendance(UserContext.getTenantId(), scope, query);
            case "HR_LEAVE" -> mapper.leave(UserContext.getTenantId(), scope, query);
            default -> throw ReportValidation.invalid("该服务不提供此数据集");
        };
        return ReportResult.from(dataset, query, rows);
    }
}
