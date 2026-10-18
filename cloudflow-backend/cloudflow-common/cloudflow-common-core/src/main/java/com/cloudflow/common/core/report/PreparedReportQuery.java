package com.cloudflow.common.core.report;

import java.time.LocalDate;
import java.util.List;

public record PreparedReportQuery(List<String> dimensions, List<ReportQuery.Measure> measures,
                                  FilterGroup filters, List<ReportQuery.Sort> sorts,
                                  int limitRows, int fetchRows, LocalDate startDate,
                                  LocalDate endDate, LocalDate snapshotDate) {
    public record Filter(String field, String operator, List<String> values) { }
    public record FilterGroup(String junction, List<Filter> conditions, List<FilterGroup> groups) { }
}
