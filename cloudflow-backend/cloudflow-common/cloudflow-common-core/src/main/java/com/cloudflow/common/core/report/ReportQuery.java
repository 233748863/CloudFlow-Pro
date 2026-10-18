package com.cloudflow.common.core.report;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

public record ReportQuery(List<String> dimensions, List<Measure> measures, FilterGroup filters,
                          List<Sort> sorts, Integer limitRows, String startDate, String endDate) {
    public record Measure(String field, String aggregate) { }
    public record Filter(String field, String operator, List<JsonNode> values) { }
    public record FilterGroup(String junction, List<Filter> conditions, List<FilterGroup> groups) { }
    public record Sort(String column, String direction) { }
}
