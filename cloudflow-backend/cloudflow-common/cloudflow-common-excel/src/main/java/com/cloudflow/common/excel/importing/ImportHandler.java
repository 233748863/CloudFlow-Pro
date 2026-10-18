package com.cloudflow.common.excel.importing;

import java.util.List;
import java.util.Map;
import java.util.Set;

public interface ImportHandler<RowType> {
    String bizType();
    List<ImportError> validateRow(RowType row, int rowNo, ImportContext context);
    void importRow(RowType row, int rowNo, ImportContext context);

    default void prepare(ImportContext context) {
    }

    default Set<String> findExistingKeys(List<RowType> rows, ImportContext context) {
        return Set.of();
    }

    default List<Map<String, String>> updateTemplateRows(ImportContext context, String keyword) {
        throw new UnsupportedOperationException("该业务不支持更新模板");
    }

    default ImportError importFailure(RowType row, int rowNo, RuntimeException failure) {
        return new ImportError(rowNo, null, null, "BUSINESS", "该行保存失败，请检查业务权限、唯一编号和引用状态");
    }
}
