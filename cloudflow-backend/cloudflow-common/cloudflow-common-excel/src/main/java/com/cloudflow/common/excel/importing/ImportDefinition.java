package com.cloudflow.common.excel.importing;

import java.util.List;

public interface ImportDefinition<RowType> {
    String bizType();
    String bizName();
    String permission();
    Class<RowType> rowClass();
    List<ImportColumn> columns();
    List<List<String>> uniqueKeys();

    default String updatePermission() {
        return null;
    }

    default List<String> instructions() {
        return List.of("只新增数据，已有记录不会覆盖。请先校验，确认后再导入。");
    }

    default int maxRows() {
        return 10000;
    }
}
