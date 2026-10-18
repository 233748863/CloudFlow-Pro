package com.cloudflow.auth.domain.report;

import com.cloudflow.common.core.report.ReportQuery;
import java.util.List;

public final class ReportDefinitionInput {
    private ReportDefinitionInput() { }

    public record Chart(String chartId, Integer version, String name, String type, String datasetCode,
                        ReportQuery query, Style style) { }
    public record Style(String palette, Boolean showLegend, Boolean showValues) { }
    public record Dashboard(String dashboardId, Integer version, String name, String remark, List<Item> items) { }
    public record Item(String chartId, Integer gridX, Integer gridY, Integer gridW, Integer gridH) { }
    public record Share(String kind, String id, String scope, Integer version) { }
}
