package com.cloudflow.common.core.report;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

public record ReportResult(String datasetCode, List<Column> columns, List<ReportRow> rows, boolean truncated,
                           int limitRows, LocalDate startDate, LocalDate endDate, LocalDate snapshotDate, String description,
                           MissingDates missingDates) {
    public record Column(String key, String field, String title, String aggregate, String unit) { }
    public record MissingDates(String claimCount, String claimAmount, String approvedAmount, String paidAmount) { }

    public static ReportResult from(ReportDataset dataset, PreparedReportQuery query, List<ReportRow> rows) {
        if (rows.stream().anyMatch(row -> row.getIntegrityError() != null && row.getIntegrityError() != 0)) {
            throw ReportValidation.invalid("源业务记录未通过金额对账或假期冲正链检查，请核对源记录");
        }
        List<Column> columns = new ArrayList<>();
        for (int index = 0; index < query.dimensions().size(); index++) {
            ReportDataset.Field field = dataset.field(query.dimensions().get(index));
            columns.add(new Column("dimension" + (index + 1), field.code(), field.name(), null, null));
        }
        for (int index = 0; index < query.measures().size(); index++) {
            ReportQuery.Measure measure = query.measures().get(index);
            ReportDataset.Field field = dataset.field(measure.field());
            columns.add(new Column("measure" + (index + 1), field.code(), field.name(), measure.aggregate(), field.unit()));
        }
        List<ReportRow> summaries = rows.stream().filter(row -> Boolean.TRUE.equals(row.getMissingDateSummary())).toList();
        if (summaries.size() > 1 || !summaries.isEmpty() && !"OA_EXPENSE".equals(dataset.code())) {
            throw ReportValidation.invalid("报表源返回了未登记的缺日期汇总");
        }
        MissingDates missingDates = null;
        if (!summaries.isEmpty()) {
            ReportRow summary = summaries.get(0);
            if (summary.getMeasure1() == null || summary.getMeasure2() == null || summary.getMeasure3() == null
                    || summary.getMeasure4() == null || summary.getMeasure1().signum() < 0
                    || summary.getMeasure1().stripTrailingZeros().scale() > 0) {
                throw ReportValidation.invalid("缺费用日期汇总格式无效");
            }
            missingDates = new MissingDates(summary.getMeasure1().toBigIntegerExact().toString(), summary.getMeasure2().toPlainString(),
                    summary.getMeasure3().toPlainString(), summary.getMeasure4().toPlainString());
        }
        List<ReportRow> nonempty = rows.stream().filter(row -> !Boolean.TRUE.equals(row.getMissingDateSummary()))
                .filter(row -> row.getSourceRows() == null || row.getSourceRows() > 0).toList();
        return new ReportResult(dataset.code(), List.copyOf(columns), nonempty.stream().limit(query.limitRows()).toList(),
                nonempty.size() > query.limitRows(), query.limitRows(), query.startDate(), query.endDate(), query.snapshotDate(), dataset.description(), missingDates);
    }
}
