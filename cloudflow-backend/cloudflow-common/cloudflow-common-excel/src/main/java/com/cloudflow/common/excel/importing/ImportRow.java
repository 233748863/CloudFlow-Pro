package com.cloudflow.common.excel.importing;

import java.util.List;
import java.util.Map;

public record ImportRow<RowType>(int rowNo, int ordinal, Map<String, String> source,
                                RowType value, List<ImportError> errors) {
}
