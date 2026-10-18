package com.cloudflow.auth.service.report;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.report.PreparedReportQuery;
import com.cloudflow.common.core.report.ReportDataset;
import com.cloudflow.common.core.report.ReportQuery;
import com.cloudflow.common.core.report.ReportRegistry;
import com.cloudflow.common.core.report.ReportResult;
import com.cloudflow.common.core.report.ReportValidation;
import feign.FeignException;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class ReportQueryService {
    private final ReportDatasetService datasets;
    private final CrmReportClient crm;
    private final OaReportClient oa;
    private final HrReportClient hr;
    private final WorkflowReportClient workflow;

    public ReportResult query(String code, ReportQuery input) {
        datasets.require(code);
        ReportDataset dataset = ReportRegistry.require(code);
        PreparedReportQuery prepared = ReportValidation.prepare(dataset, input, LocalDate.now());
        ReportQuery effective = new ReportQuery(prepared.dimensions(), prepared.measures(), input.filters(), prepared.sorts(),
                prepared.limitRows(), prepared.startDate() == null ? null : prepared.startDate().toString(),
                prepared.endDate() == null ? null : prepared.endDate().toString());
        R<ReportResult> response;
        try {
            response = switch (dataset.module()) {
                case "crm" -> crm.query(code, effective);
                case "oa" -> oa.query(code, effective);
                case "hr" -> hr.query(code, effective);
                case "workflow" -> workflow.query(code, effective);
                default -> throw ReportValidation.invalid("数据集来源服务未注册");
            };
        } catch (FeignException exception) {
            throw new ServiceException("报表源服务暂不可用或查询超时，请缩小范围后重试", exception.status() == 403 ? 403 : 503);
        }
        datasets.require(code);
        if (response == null) throw new ServiceException("报表源服务未返回结果", 503);
        if (!response.isSuccess()) {
            int status = response.getCode();
            throw new ServiceException(status == 400 ? "源记录未通过金额或冲正链校验，未返回统计结果" : "报表查询失败或权限已经变化",
                    List.of(400, 401, 403, 409, 429, 504).contains(status) ? status : 503);
        }
        ReportResult result = response.getData();
        if (result == null || !code.equals(result.datasetCode()) || result.rows() == null
                || result.rows().size() > prepared.limitRows() || result.limitRows() != prepared.limitRows()
                || !ReportResult.from(dataset, prepared, List.of()).columns().equals(result.columns())
                || !java.util.Objects.equals(prepared.startDate(), result.startDate())
                || !java.util.Objects.equals(prepared.endDate(), result.endDate())
                || "OA_EXPENSE".equals(code) != (result.missingDates() != null)) {
            throw new ServiceException("报表源服务结果与注册契约不一致", 503);
        }
        return result;
    }
}
