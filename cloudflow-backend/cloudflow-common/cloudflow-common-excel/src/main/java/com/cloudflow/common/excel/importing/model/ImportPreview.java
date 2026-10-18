package com.cloudflow.common.excel.importing.model;

import com.cloudflow.common.core.domain.PageResult;
import java.util.List;
import java.util.Map;

public record ImportPreview(ImportTask task, List<Map<String, Object>> rows,
                            Map<String, Long> errorCounts, PageResult<ImportErrorRecord> errors) {
}
