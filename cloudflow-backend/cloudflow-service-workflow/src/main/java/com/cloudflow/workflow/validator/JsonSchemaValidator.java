package com.cloudflow.workflow.validator;

import com.cloudflow.common.core.utils.RestrictedExpression;
import com.cloudflow.workflow.exception.WorkflowFormValidationException;
import com.cloudflow.workflow.exception.WorkflowException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

@Component
public class JsonSchemaValidator {
    public static final Set<String> LAYOUT_TYPES = Set.of("GROUP", "GRID", "TABS", "COLLAPSE");
    public static final Set<String> STATIC_TYPES = Set.of("DESCRIPTION", "DIVIDER");
    public static final Set<String> IM_SUMMARY_TYPES = Set.of("TEXT", "TEXTAREA", "NUMBER", "AMOUNT", "DATE", "DATETIME", "TIME", "SELECT", "RADIO_GROUP", "SWITCH");
    public static final Set<String> REFERENCE_TYPES = Set.of("EMPLOYEE", "DEPT", "POST", "POSITION", "USER_MULTI", "DEPT_MULTI");
    public static final Set<String> COLUMN_TYPES = Set.of("TEXT", "NUMBER", "AMOUNT", "DATE", "SELECT", "DICT_SELECT", "SWITCH", "EMPLOYEE", "DEPT", "UPLOAD_FILE");
    public static final Set<String> FIELD_TYPES = Set.of("TEXT", "TEXTAREA", "RICH_TEXT", "NUMBER", "AMOUNT", "DATE", "DATETIME", "TIME", "DATE_RANGE", "SELECT", "MULTI_SELECT", "RADIO_GROUP", "CHECKBOX_GROUP", "SWITCH", "DICT_SELECT", "EMPLOYEE", "DEPT", "POST", "POSITION", "USER_MULTI", "DEPT_MULTI", "UPLOAD_FILE", "UPLOAD_IMAGE", "DESCRIPTION", "DIVIDER", "GROUP", "GRID", "TABS", "COLLAPSE", "SUB_TABLE");
    private static final Set<String> RESERVED_IDS = Set.of("__proto__", "prototype", "constructor", "_rowId");
    private static final Set<String> NUMERIC_TYPES = Set.of("NUMBER", "AMOUNT");
    private static final Set<String> SELECT_TYPES = Set.of("SELECT", "MULTI_SELECT", "RADIO_GROUP", "CHECKBOX_GROUP");
    private static final Set<String> IMAGE_EXTENSIONS = Set.of("png", "jpg", "jpeg", "gif", "webp");
    private static final Map<String, Set<String>> MIME_EXTENSIONS = Map.ofEntries(
            Map.entry("image/*", IMAGE_EXTENSIONS), Map.entry("image/png", Set.of("png")),
            Map.entry("image/jpeg", Set.of("jpg", "jpeg")), Map.entry("image/gif", Set.of("gif")),
            Map.entry("image/webp", Set.of("webp")), Map.entry("application/pdf", Set.of("pdf")),
            Map.entry("text/plain", Set.of("txt")), Map.entry("text/csv", Set.of("csv")),
            Map.entry("application/zip", Set.of("zip")), Map.entry("application/msword", Set.of("doc")),
            Map.entry("application/vnd.openxmlformats-officedocument.wordprocessingml.document", Set.of("docx")),
            Map.entry("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", Set.of("xlsx")),
            Map.entry("application/vnd.ms-excel", Set.of("xls")));
    private final ObjectMapper objectMapper = new ObjectMapper();

    public interface ValueLookup {
        Set<String> dictionaryValues(String dictType);
        boolean referenceAllowed(String type, long referenceId, JsonNode field);
        FileValue file(long fileId);
    }

    public record FileValue(long size, String extension) {
    }

    public record FormValidationResult(Map<String, String> errors) {
        public boolean valid() {
            return errors.isEmpty();
        }

        public void throwIfInvalid() {
            if (valid()) return;
            throw new WorkflowFormValidationException(errors);
        }
    }

    private static final ValueLookup DENY_LOOKUP = new ValueLookup() {
        public Set<String> dictionaryValues(String dictType) { return Set.of(); }
        public boolean referenceAllowed(String type, long referenceId, JsonNode field) { return false; }
        public FileValue file(long fileId) { return null; }
    };

    public void validateFormSchema(String formSchema) {
        try {
            JsonNode fields = parseFields(formSchema);
            Set<String> ids = new HashSet<>();
            validateSchemaFields(fields, ids, 0, false);
            validateExpressions(fields, ids);
        } catch (IllegalArgumentException exception) {
            throw invalidSchema(exception.getMessage());
        }
    }

    public JsonNode parseFields(String fieldsJson) {
        if (fieldsJson == null || fieldsJson.isBlank()) throw invalidSchema("表单字段定义不能为空");
        if (fieldsJson.length() > 1_048_576) throw invalidSchema("表单字段定义不能超过1048576字符");
        try {
            JsonNode fields = objectMapper.readTree(fieldsJson);
            if (fields == null || !fields.isArray()) throw invalidSchema("表单字段定义必须为数组");
            return fields;
        } catch (WorkflowException exception) {
            throw exception;
        } catch (Exception exception) {
            throw invalidSchema("表单字段定义不是有效JSON");
        }
    }

    public FormValidationResult validateFormData(String fieldsJson, Map<String, ?> data) {
        return validateFormData(fieldsJson, data, true, DENY_LOOKUP);
    }

    public FormValidationResult validateFormData(String fieldsJson, Map<String, ?> data, boolean complete, ValueLookup lookup) {
        validateFormSchema(fieldsJson);
        return validateValues(parseFields(fieldsJson), data, complete, lookup);
    }

    public FormValidationResult validateValues(JsonNode fields, Map<String, ?> data, boolean complete, ValueLookup lookup) {
        Map<String, String> errors = new LinkedHashMap<>();
        validateDataFields(fields, data == null ? Map.of() : data, "", complete, lookup == null ? DENY_LOOKUP : lookup, errors, false);
        return new FormValidationResult(Map.copyOf(errors));
    }

    public List<JsonNode> valueFields(JsonNode fields) {
        List<JsonNode> result = new ArrayList<>();
        for (JsonNode field : fields) {
            String type = field.path("type").asText();
            if (LAYOUT_TYPES.contains(type)) result.addAll(valueFields(field.path("children")));
            else if (!STATIC_TYPES.contains(type)) result.add(field);
        }
        return result;
    }

    private void validateSchemaFields(JsonNode fields, Set<String> ids, int depth, boolean columns) {
        for (JsonNode field : fields) {
            if (!field.isObject()) throw invalidSchema("字段定义必须为对象");
            String fieldId = field.path("id").asText();
            String type = field.path("type").asText();
            if (!fieldId.matches("[A-Za-z_][A-Za-z0-9_]{0,99}") || RESERVED_IDS.contains(fieldId) || !ids.add(fieldId)) throw invalidSchema("字段ID无效或在同一数据范围内重复");
            if (!FIELD_TYPES.contains(type)) throw new WorkflowException("FORM_UNSUPPORTED_FIELD_TYPE", "不支持的字段类型");
            if (!field.path("label").isTextual() || field.path("label").asText().isBlank()) throw invalidSchema("字段标签不能为空");
            if (columns && !COLUMN_TYPES.contains(type)) throw invalidSchema("明细子表包含不支持的列类型");
            if (field.path("imSummaryAllowed").isBoolean() && field.path("imSummaryAllowed").booleanValue()
                    && (columns || !IM_SUMMARY_TYPES.contains(type))) throw invalidSchema("此字段不支持显示在企业微信待办摘要");
            if (LAYOUT_TYPES.contains(type)) {
                if (depth >= 3) throw invalidSchema("布局容器最多嵌套3层");
                if (!field.path("children").isArray() || field.path("children").isEmpty()) throw invalidSchema("布局容器至少需要一个子字段");
                if ("GRID".equals(type) && (!field.path("columns").isIntegralNumber() || !Set.of(2, 3, 4).contains(field.path("columns").asInt()))) throw invalidSchema("网格列数必须为2、3或4");
                validateSchemaFields(field.get("children"), ids, depth + 1, false);
            } else if ("SUB_TABLE".equals(type)) {
                if (!field.path("columns").isArray() || field.path("columns").isEmpty()) throw invalidSchema("明细子表至少需要一列");
                validateSchemaFields(field.get("columns"), new HashSet<>(), depth, true);
                for (JsonNode column : field.get("columns")) if (fieldId.length() + 1 + column.path("id").asText().length() > 100) throw invalidSchema("子表ID与列ID组成的完整字段标识不能超过100字符");
                int minimum = integer(field, "minRows", 0, 0, 500);
                int maximum = integer(field, "maxRows", 100, 1, 500);
                if (minimum > maximum) throw invalidSchema("最少行数不能超过最多行数");
                Set<String> summaries = new HashSet<>();
                if (field.has("summaryColumns") && !field.get("summaryColumns").isArray()) throw invalidSchema("合计配置必须为数组");
                for (JsonNode summary : field.path("summaryColumns")) {
                    String columnId = summary.path("columnId").asText();
                    boolean numericColumn = false;
                    for (JsonNode column : field.get("columns")) if (column.path("id").asText().equals(columnId) && NUMERIC_TYPES.contains(column.path("type").asText())) numericColumn = true;
                    if (!numericColumn || !Set.of("SUM", "COUNT", "AVG").contains(summary.path("aggregation").asText()) || !summaries.add(columnId)) throw invalidSchema("合计项须唯一引用数值列并选择SUM、COUNT或AVG");
                }
            } else if (field.has("children") || field.has("columns")) throw invalidSchema("普通字段不能定义子字段");
            if (SELECT_TYPES.contains(type)) {
                if (!field.path("options").isArray() || field.path("options").isEmpty()) throw invalidSchema("选择字段必须配置选项");
                Set<String> options = new HashSet<>();
                for (JsonNode option : field.get("options")) if (!option.isTextual() || option.asText().isBlank() || !options.add(option.asText())) throw invalidSchema("字段选项必须为不重复的非空文字");
            }
            if ("DICT_SELECT".equals(type) && !field.path("dictType").asText().matches("[A-Za-z_][A-Za-z0-9_:-]{0,99}")) throw invalidSchema("字典选择字段必须指定有效字典类型");
            validateReferenceConfiguration(field);
            if (field.has("precision")) integer(field, "precision", 2, 0, 18);
            if (field.has("min")) decimal(field.get("min"));
            if (field.has("max")) decimal(field.get("max"));
            if (field.has("min") && field.has("max") && decimal(field.get("min")).compareTo(decimal(field.get("max"))) > 0) throw invalidSchema("最小值不能超过最大值");
            if (type.startsWith("UPLOAD_")) {
                int maximum = integer(field, "maxCount", columns ? 1 : 5, 1, 100);
                if (columns && maximum != 1) throw invalidSchema("明细附件每行只允许一个文件");
                if (field.has("maxSize") && decimal(field.get("maxSize")).signum() <= 0) throw invalidSchema("文件大小上限必须大于零");
            }
            if (field.hasNonNull("regex") && !field.get("regex").asText().isBlank()) safePattern(field.get("regex").asText());
            for (String flag : List.of("required", "readonly", "imSummaryAllowed", "multiple", "onlyActive", "defaultExpanded", "allowAdd", "allowDelete", "allowSort", "allowCopyRow")) {
                if (field.has(flag) && !field.get(flag).isBoolean()) throw invalidSchema("字段开关配置必须为布尔值");
            }
        }
    }

    private void validateExpressions(JsonNode fields, Set<String> declared) {
        for (JsonNode field : fields) {
            for (String property : List.of("visibleExpr", "disabledExpr")) {
                if (!field.hasNonNull(property)) continue;
                if (!field.get(property).isTextual()) throw invalidSchema("字段条件必须为文字");
                if (field.get(property).asText().isBlank()) continue;
                try { RestrictedExpression.validatePredicate(field.get(property).asText(), declared); }
                catch (IllegalArgumentException exception) { throw invalidSchema("字段条件不符合受限表达式规范"); }
            }
            if (LAYOUT_TYPES.contains(field.path("type").asText())) validateExpressions(field.path("children"), declared);
            if ("SUB_TABLE".equals(field.path("type").asText())) {
                Set<String> rowFields = new HashSet<>(declared);
                for (JsonNode column : field.path("columns")) rowFields.add(column.path("id").asText());
                validateExpressions(field.path("columns"), rowFields);
            }
        }
    }

    private void validateReferenceConfiguration(JsonNode field) {
        if (field.hasNonNull("scopeDeptId")) {
            JsonNode scope = field.get("scopeDeptId");
            if (!scope.isTextual()) throw invalidSchema("部门范围编号必须为文字");
            if (!scope.asText().isBlank()) {
                if (!Set.of("EMPLOYEE", "DEPT", "USER_MULTI", "DEPT_MULTI").contains(field.path("type").asText()) || !scope.asText().matches("[1-9][0-9]{0,18}")) throw invalidSchema("部门范围配置无效");
                try { identifier(scope.asText()); }
                catch (IllegalArgumentException exception) { throw invalidSchema("部门范围编号超出有效范围"); }
            }
        }
        Set<String> targets = new HashSet<>();
        if (field.hasNonNull("displayFieldId")) {
            if (!field.get("displayFieldId").isTextual()) throw invalidSchema("展示字段标识必须为文字");
            targets.add(field.path("displayFieldId").asText());
        }
        if (field.has("fillMappings") && !field.path("fillMappings").isArray()) throw invalidSchema("回填规则必须为数组");
        for (JsonNode mapping : field.path("fillMappings")) {
            if (!mapping.path("targetFieldId").isTextual()) throw invalidSchema("回填目标标识必须为文字");
            targets.add(mapping.path("targetFieldId").asText());
            for (String property : List.of("source", "fallbackSource")) {
                if ("fallbackSource".equals(property) && !mapping.hasNonNull(property)) continue;
                if (!mapping.path(property).isTextual() || !mapping.path(property).asText().matches("[A-Za-z_][A-Za-z0-9_]{0,99}")) throw invalidSchema("回填来源配置无效");
            }
            if (mapping.has("clearWhenEmpty") && !mapping.get("clearWhenEmpty").isBoolean()) throw invalidSchema("回填清空开关必须为布尔值");
        }
        if (!targets.isEmpty() && !Set.of("EMPLOYEE", "DEPT", "POST", "POSITION").contains(field.path("type").asText())) throw invalidSchema("当前字段不支持回填配置");
        for (String target : targets) if (!target.matches("[A-Za-z_][A-Za-z0-9_]{0,99}") || RESERVED_IDS.contains(target) || target.equals(field.path("id").asText())) throw invalidSchema("回填目标标识无效");
        if (field.hasNonNull("filterByDeptFieldId") && (!field.get("filterByDeptFieldId").isTextual() || !field.path("filterByDeptFieldId").asText().matches("[A-Za-z_][A-Za-z0-9_]{0,99}"))) throw invalidSchema("部门联动字段标识无效");
    }

    private void validateDataFields(JsonNode fields, Map<String, ?> data, String prefix, boolean complete, ValueLookup lookup, Map<String, String> errors, boolean row) {
        List<JsonNode> values = valueFields(fields);
        Set<String> declared = new HashSet<>();
        if (row) declared.add("_rowId");
        for (JsonNode field : values) {
            String fieldId = field.path("id").asText();
            String path = prefix + fieldId;
            declared.add(fieldId);
            Object value = data.get(fieldId);
            if (complete && field.path("required").asBoolean() && empty(value)) { errors.put(path, "此项必填"); continue; }
            if (empty(value) && emptyValueAllowed(field, value)) {
                if ("SUB_TABLE".equals(field.path("type").asText()) && complete && field.path("minRows").asInt() > 0) errors.put(path, "明细行数少于最少行数");
                continue;
            }
            try {
                if ("SUB_TABLE".equals(field.path("type").asText())) validateRows(field, value, path, complete, lookup, errors);
                else validateSingle(field, value, lookup, row);
            } catch (IllegalArgumentException exception) {
                errors.putIfAbsent(path, exception.getMessage());
            }
        }
        for (String fieldId : data.keySet()) if (!declared.contains(fieldId)) errors.put(prefix + fieldId, row ? "明细包含未声明的列" : "表单包含未声明的字段");
        if (row && data.containsKey("_rowId") && (!(data.get("_rowId") instanceof String rowId) || rowId.isBlank() || rowId.length() > 100)) errors.put(prefix + "_rowId", "明细行标识无效");
    }

    private void validateRows(JsonNode field, Object value, String path, boolean complete, ValueLookup lookup, Map<String, String> errors) {
        if (!(value instanceof List<?> rows)) throw invalidValue("明细必须为数组");
        int minimum = field.path("minRows").asInt(0);
        int maximum = field.path("maxRows").asInt(100);
        if (rows.size() > maximum || rows.size() > 500 || complete && rows.size() < minimum) throw invalidValue("明细行数不符合限制");
        Set<String> identities = new HashSet<>();
        for (int rowIndex = 0; rowIndex < rows.size(); rowIndex++) {
            String rowPath = path + "[" + rowIndex + "].";
            if (!(rows.get(rowIndex) instanceof Map<?, ?> rawRow)) { errors.put(rowPath, "明细行必须为对象"); continue; }
            Map<String, Object> row = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : rawRow.entrySet()) {
                if (!(entry.getKey() instanceof String columnId)) { errors.put(rowPath, "明细列名必须为文字"); continue; }
                row.put(columnId, entry.getValue());
            }
            if (row.get("_rowId") instanceof String rowId && !identities.add(rowId)) errors.put(rowPath + "_rowId", "明细行标识不能重复");
            validateDataFields(field.path("columns"), row, rowPath, complete, lookup, errors, true);
        }
    }

    private void validateSingle(JsonNode field, Object value, ValueLookup lookup, boolean column) {
        String type = field.path("type").asText();
        if (NUMERIC_TYPES.contains(type)) {
            BigDecimal number = decimal(value);
            if (field.has("min") && number.compareTo(decimal(field.get("min"))) < 0) throw invalidValue("数值低于最小值");
            if (field.has("max") && number.compareTo(decimal(field.get("max"))) > 0) throw invalidValue("数值超过最大值");
            int precision = field.has("precision") ? field.get("precision").asInt() : "AMOUNT".equals(type) ? 2 : 18;
            if (Math.max(0, number.stripTrailingZeros().scale()) > precision) throw invalidValue("数值超过允许的小数精度");
        } else if ("SWITCH".equals(type)) {
            if (!(value instanceof Boolean)) throw invalidValue("开关值必须为布尔值");
        } else if (Set.of("DATE", "DATETIME", "TIME", "DATE_RANGE").contains(type)) validateDate(type, value);
        else if (SELECT_TYPES.contains(type) || "DICT_SELECT".equals(type)) {
            Set<String> options = new HashSet<>();
            if ("DICT_SELECT".equals(type)) {
                Set<String> dictionary = lookup.dictionaryValues(field.path("dictType").asText());
                if (dictionary != null) options.addAll(dictionary);
            } else for (JsonNode option : field.path("options")) options.add(option.asText());
            boolean multiple = Set.of("MULTI_SELECT", "CHECKBOX_GROUP").contains(type) || "DICT_SELECT".equals(type) && field.path("multiple").asBoolean();
            List<?> selected = multiple ? list(value) : List.of(value);
            Set<String> unique = new HashSet<>();
            for (Object selection : selected) if (!(selection instanceof String text) || !options.contains(text) || !unique.add(text)) throw invalidValue("选择值不在有效选项中或存在重复");
        } else if (REFERENCE_TYPES.contains(type)) {
            List<?> selected = Set.of("USER_MULTI", "DEPT_MULTI").contains(type) ? list(value) : List.of(value);
            Set<Long> unique = new HashSet<>();
            for (Object selection : selected) {
                long referenceId = identifier(selection);
                if (!unique.add(referenceId) || !lookup.referenceAllowed(type, referenceId, field)) throw invalidValue("所选记录无效、重复或不可访问");
            }
        } else if (type.startsWith("UPLOAD_")) validateFiles(field, value, lookup, column);
        else if (!(value instanceof String)) throw invalidValue("文本字段必须为文字");
        if (field.hasNonNull("regex") && !field.get("regex").asText().isBlank()) {
            if (!(value instanceof String) && !(value instanceof Number)) throw invalidValue("格式校验仅支持文字或数字");
            String text = String.valueOf(value);
            if (text.length() > 10_000 || !safePattern(field.get("regex").asText()).matcher(text).matches()) throw invalidValue("字段未通过格式校验");
        }
    }

    private void validateDate(String type, Object value) {
        try {
            if ("DATE_RANGE".equals(type)) {
                List<?> range = list(value);
                if (range.size() != 2 || !(range.get(0) instanceof String start) || !(range.get(1) instanceof String end)) throw invalidValue("日期范围需要起止日期");
                validateDate("DATE", start);
                validateDate("DATE", end);
                if (LocalDate.parse(start).isAfter(LocalDate.parse(end))) throw invalidValue("结束日期不能早于开始日期");
            } else {
                if (!(value instanceof String text)) throw invalidValue("日期时间必须为文字");
                if ("DATE".equals(type)) {
                    if (!text.matches("\\d{4}-\\d{2}-\\d{2}")) throw invalidValue("日期格式必须为YYYY-MM-DD");
                    LocalDate.parse(text);
                } else if ("TIME".equals(type)) LocalTime.parse(text);
                else LocalDateTime.parse(text.replace(' ', 'T'));
            }
        } catch (java.time.DateTimeException exception) {
            throw invalidValue("日期或时间无效");
        }
    }

    private void validateFiles(JsonNode field, Object value, ValueLookup lookup, boolean column) {
        List<?> files = list(value);
        if (files.size() > field.path("maxCount").asInt(column ? 1 : 5)) throw invalidValue("附件数量超过上限");
        BigDecimal maximumBytes = field.has("maxSize") ? decimal(field.get("maxSize")).multiply(BigDecimal.valueOf(1_048_576)) : BigDecimal.valueOf(10_485_760);
        Set<Long> unique = new HashSet<>();
        for (Object reference : files) {
            long fileId = identifier(reference);
            FileValue file = lookup.file(fileId);
            if (!unique.add(fileId) || file == null || file.size() <= 0) throw invalidValue("附件不存在、重复或不可访问");
            if (BigDecimal.valueOf(file.size()).compareTo(maximumBytes) > 0) throw invalidValue("附件大小超过上限");
            String extension = file.extension() == null ? "" : file.extension().toLowerCase(Locale.ROOT).replaceFirst("^\\.", "");
            if ("UPLOAD_IMAGE".equals(field.path("type").asText()) && !IMAGE_EXTENSIONS.contains(extension)) throw invalidValue("附件内容不是支持的图片格式");
            String accept = field.path("accept").asText();
            if (!accept.isBlank()) {
                boolean accepted = false;
                for (String item : accept.toLowerCase(Locale.ROOT).split(",")) {
                    String rule = item.trim();
                    if (rule.equals("." + extension) || MIME_EXTENSIONS.getOrDefault(rule, Set.of()).contains(extension)) accepted = true;
                }
                if (!accepted) throw invalidValue("附件内容类型不符合字段限制");
            }
        }
    }

    private static Pattern safePattern(String regex) {
        if (regex.length() > 512 || !regex.startsWith("^") || !regex.endsWith("$") || regex.contains("(") || regex.contains(")") || regex.contains("|") || regex.matches(".*\\\\[1-9].*")) throw new WorkflowException("FORM_UNSUPPORTED_VALIDATION", "仅支持无分组、无分支的完整匹配规则");
        boolean escaped = false;
        boolean characterClass = false;
        int repetitions = 0;
        for (char character : regex.toCharArray()) {
            if (escaped) { escaped = false; continue; }
            if (character == '\\') { escaped = true; continue; }
            if (character == '[') characterClass = true;
            else if (character == ']') characterClass = false;
            else if (!characterClass && (character == '*' || character == '+' || character == '?' || character == '{')) repetitions++;
        }
        if (repetitions > 1) throw new WorkflowException("FORM_UNSUPPORTED_VALIDATION", "重复量词校验规则不受支持");
        try { return Pattern.compile(regex); }
        catch (java.util.regex.PatternSyntaxException exception) { throw new WorkflowException("FORM_UNSUPPORTED_VALIDATION", "字段格式校验配置无效"); }
    }

    private static BigDecimal decimal(Object value) {
        if (value instanceof JsonNode node) {
            if (node.isNumber()) value = node.decimalValue();
            else if (node.isTextual()) value = node.textValue();
            else throw invalidValue("必须为有效数字");
        }
        if (!(value instanceof String) && !(value instanceof Number)) throw invalidValue("必须为有效数字");
        String text = String.valueOf(value);
        if (text.length() > 128) throw invalidValue("数字长度超过限制");
        try {
            BigDecimal decimal = new BigDecimal(text);
            if (Math.abs((long) decimal.scale()) > 128 || decimal.precision() > 128) throw invalidValue("数字精度超过限制");
            return decimal;
        } catch (NumberFormatException exception) { throw invalidValue("必须为有效数字"); }
    }

    private static long identifier(Object value) {
        try {
            long identifier = decimal(value).longValueExact();
            if (identifier <= 0) throw invalidValue("记录编号必须为正整数");
            return identifier;
        } catch (ArithmeticException exception) { throw invalidValue("记录编号必须为有效整数"); }
    }

    private static int integer(JsonNode field, String property, int fallback, int minimum, int maximum) {
        if (!field.has(property)) return fallback;
        JsonNode value = field.get(property);
        if (!value.isIntegralNumber() || !value.canConvertToInt() || value.asInt() < minimum || value.asInt() > maximum) throw invalidSchema("字段整数配置超出允许范围");
        return value.asInt();
    }

    private static List<?> list(Object value) {
        if (!(value instanceof List<?> list)) throw invalidValue("字段必须为数组");
        return list;
    }

    private static boolean empty(Object value) {
        return value == null || value instanceof String text && text.isBlank() || value instanceof Collection<?> collection && collection.isEmpty();
    }

    private static boolean emptyValueAllowed(JsonNode field, Object value) {
        if (value == null) return true;
        String type = field.path("type").asText();
        boolean array = Set.of("SUB_TABLE", "DATE_RANGE", "MULTI_SELECT", "CHECKBOX_GROUP", "USER_MULTI", "DEPT_MULTI", "UPLOAD_FILE", "UPLOAD_IMAGE").contains(type)
                || "DICT_SELECT".equals(type) && field.path("multiple").asBoolean();
        return array ? value instanceof List<?> : value instanceof String && !"SWITCH".equals(type);
    }

    private static WorkflowException invalidSchema(String message) {
        return WorkflowException.validationError(message);
    }

    private static IllegalArgumentException invalidValue(String message) {
        return new IllegalArgumentException(message);
    }
}
