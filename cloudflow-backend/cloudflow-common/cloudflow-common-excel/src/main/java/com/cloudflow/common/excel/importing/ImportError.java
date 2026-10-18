package com.cloudflow.common.excel.importing;

public record ImportError(int rowNo, String columnName, String cellValue, String errorType, String errorMessage) {
    public static ImportError business(int rowNo, String columnName, String message) {
        return new ImportError(rowNo, columnName, null, "BUSINESS", message);
    }
}
