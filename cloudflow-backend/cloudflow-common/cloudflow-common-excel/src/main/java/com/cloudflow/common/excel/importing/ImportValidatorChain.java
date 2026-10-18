package com.cloudflow.common.excel.importing;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.beans.BeanWrapperImpl;

public class ImportValidatorChain {
    private static final Pattern PHONE = Pattern.compile("(?:\\+86[- ]?)?1[3-9]\\d{9}");
    private static final Pattern EMAIL = Pattern.compile("[^\\s@]+@[^\\s@.]+(?:\\.[^\\s@.]+)+");
    private static final int[] ID_WEIGHTS = {7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2};
    private static final String ID_CHECKSUMS = "10X98765432";
    private final ObjectMapper objectMapper;

    public ImportValidatorChain(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public <RowType> ImportRow<RowType> convert(ImportDefinition<RowType> definition, int rowNo, int ordinal,
                                               Map<String, String> source, ImportContext context) {
        List<ImportError> errors = new ArrayList<>();
        Map<String, Object> converted = new LinkedHashMap<>();
        for (ImportColumn column : definition.columns()) {
            String original = source.get(column.getField());
            String value = original == null ? "" : original.trim();
            if (value.isEmpty()) {
                if (column.isRequired()) error(errors, rowNo, column, original, "REQUIRED", "必填项不能为空");
                continue;
            }
            if (value.codePointCount(0, value.length()) > column.getMaxLength()) {
                error(errors, rowNo, column, original, "RANGE", "内容不能超过" + column.getMaxLength() + "个字符");
                continue;
            }
            if (column.getPattern() != null && !Pattern.matches(column.getPattern(), value)) {
                error(errors, rowNo, column, original, "FORMAT", "格式不符合模板说明");
                continue;
            }
            if (!column.getOptions().isEmpty()) {
                String selected = column.getOptions().containsKey(value) ? value : column.getOptions().entrySet().stream()
                        .filter(entry -> Objects.equals(entry.getValue(), value)).map(Map.Entry::getKey).findFirst().orElse(null);
                if (selected == null) error(errors, rowNo, column, original, "REFERENCE", "请选择模板提供的有效选项");
                else converted.put(column.getField(), selected);
                continue;
            }
            try {
                Object parsed = switch (column.getType()) {
                    case TEXT -> value;
                    case DATE -> LocalDate.parse(value, DateTimeFormatter.ISO_LOCAL_DATE);
                    case INTEGER -> new BigDecimal(value).longValueExact();
                    case DECIMAL -> new BigDecimal(value);
                    case EMAIL -> checked(EMAIL.matcher(value).matches(), value);
                    case PHONE -> checked(PHONE.matcher(value).matches(), value);
                    case ID_CARD -> checked(validIdCard(value), value.toUpperCase(java.util.Locale.ROOT));
                    case REFERENCE -> context.resolve(column.getReference(), value);
                };
                if (parsed instanceof Number number) {
                    BigDecimal numeric = new BigDecimal(number.toString());
                    if (column.getMinimum() != null && numeric.compareTo(column.getMinimum()) < 0
                            || column.getMaximum() != null && numeric.compareTo(column.getMaximum()) > 0) {
                        error(errors, rowNo, column, original, "RANGE", "数值超出模板允许范围");
                        continue;
                    }
                }
                converted.put(column.getField(), parsed);
            } catch (RuntimeException exception) {
                boolean reference = column.getType() == ImportColumn.Type.REFERENCE;
                error(errors, rowNo, column, original, reference ? "REFERENCE" : "FORMAT",
                        reference ? exception.getMessage() : "格式不正确，请按模板示例填写");
            }
        }
        RowType value = null;
        if (errors.isEmpty()) {
            try {
                value = objectMapper.convertValue(converted, definition.rowClass());
            } catch (IllegalArgumentException exception) {
                errors.add(new ImportError(rowNo, null, null, "FORMAT", "字段类型转换失败，请检查数字精度和日期格式"));
            }
        }
        return new ImportRow<>(rowNo, ordinal, source, value, errors);
    }

    public <RowType> void validateBatch(ImportDefinition<RowType> definition, ImportHandler<RowType> handler,
                                        List<ImportRow<RowType>> rows, ImportContext context) {
        List<RowType> eligible = rows.stream().filter(row -> row.errors().isEmpty()).map(ImportRow::value).toList();
        Set<String> existing = eligible.isEmpty() ? Set.of() : handler.findExistingKeys(eligible, context);
        for (ImportRow<RowType> row : rows) {
            if (!row.errors().isEmpty()) continue;
            BeanWrapperImpl properties = new BeanWrapperImpl(row.value());
            for (List<String> fields : definition.uniqueKeys()) {
                String key = ImportKeys.forFields(fields, fields.stream().map(properties::getPropertyValue).toArray());
                if (key != null && (!context.getFileKeys().add(key) || existing.contains(key))) {
                    ImportColumn column = definition.columns().stream().filter(item -> fields.contains(item.getField())).findFirst().orElseThrow();
                    error(row.errors(), row.rowNo(), column, row.source().get(column.getField()), "DUPLICATE", "唯一值在文件或当前租户数据库中已存在（含已删除记录）");
                }
            }
            if (!row.errors().isEmpty()) continue;
            List<ImportError> business = handler.validateRow(row.value(), row.rowNo(), context);
            if (business != null) row.errors().addAll(business);
        }
    }

    private static String checked(boolean valid, String value) {
        if (!valid) throw new IllegalArgumentException();
        return value;
    }

    private static boolean validIdCard(String value) {
        if (!value.matches("[1-9]\\d{16}[0-9Xx]")) return false;
        try {
            LocalDate birth = LocalDate.parse(value.substring(6, 14), DateTimeFormatter.BASIC_ISO_DATE);
            if (birth.isAfter(LocalDate.now())) return false;
        } catch (RuntimeException exception) {
            return false;
        }
        int checksum = 0;
        for (int index = 0; index < ID_WEIGHTS.length; index++) checksum += (value.charAt(index) - '0') * ID_WEIGHTS[index];
        return Character.toUpperCase(value.charAt(17)) == ID_CHECKSUMS.charAt(checksum % 11);
    }

    private void error(List<ImportError> errors, int rowNo, ImportColumn column, String value, String type, String message) {
        errors.add(new ImportError(rowNo, column.getName(), value, type, column.getName() + "：" + message));
    }
}
