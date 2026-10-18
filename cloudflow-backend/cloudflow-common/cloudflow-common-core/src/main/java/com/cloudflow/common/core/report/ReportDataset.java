package com.cloudflow.common.core.report;

import java.util.List;

public record ReportDataset(String code, String name, String module, String mapperMethod,
                            String permission, List<String> sourcePermissions, boolean timeBased,
                            String unitPartition, String description, List<Field> fields) {
    public ReportDataset {
        sourcePermissions = List.copyOf(sourcePermissions);
        fields = List.copyOf(fields);
    }

    public Field field(String code) {
        return fields.stream().filter(field -> field.code().equals(code)).findFirst()
                .orElseThrow(() -> ReportValidation.invalid("包含未注册的报表字段"));
    }

    public record Field(String code, String name, String type, boolean dimension,
                        List<String> aggregates, List<String> operators, String unit) {
        public Field {
            aggregates = List.copyOf(aggregates);
            operators = List.copyOf(operators);
        }
    }
}
