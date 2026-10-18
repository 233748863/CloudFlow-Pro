package com.cloudflow.auth.domain.report;

import com.cloudflow.common.core.report.ReportDataset;
import com.cloudflow.common.core.report.ReportQuery;
import java.util.List;

public final class ReportDefinitionView {
    private ReportDefinitionView() { }

    public record Dataset(Long datasetId, ReportDataset definition, String availability, String message) { }
    public record Chart(Long chartId, Integer version, String name, String type, String datasetCode,
                        ReportQuery query, ReportDefinitionInput.Style style, Long ownerId,
                        String shareScope, boolean editable, String availability) { }
    public record Item(Long chartId, Integer gridX, Integer gridY, Integer gridW, Integer gridH,
                       Chart chart, String availability) { }
    public record Dashboard(Long dashboardId, Integer version, String name, String remark, Long ownerId,
                            String shareScope, boolean editable, List<Item> items) { }
}
