package com.cloudflow.workflow.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.utils.RestrictedExpression;
import com.cloudflow.workflow.domain.vo.DraftLaunchContextVO;
import com.cloudflow.workflow.domain.vo.FieldPermissionVO;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.exception.WorkflowFormValidationException;
import com.cloudflow.workflow.mapper.WorkflowFormReferenceMapper;
import com.cloudflow.workflow.validator.JsonSchemaValidator;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class WorkflowFormInputService {
    private static final Set<String> SINGLE_REFERENCES = Set.of("EMPLOYEE", "DEPT", "POST", "POSITION");
    private final WorkflowFormReferenceMapper references;
    private final WorkflowDraftJson json;
    private final JsonSchemaValidator validator;

    public Map<String, Object> validate(DraftLaunchContextVO context, Map<String, Object> supplied, boolean complete) {
        return validate(context, supplied, complete, Map.of(), false, true, null);
    }

    public Map<String, Object> validateApproval(DraftLaunchContextVO context, Map<String, Object> original,
                                                Map<String, Object> supplied, boolean defaultEditable) {
        return validateApproval(context, original, supplied, defaultEditable, null);
    }

    public Map<String, Object> validateApproval(DraftLaunchContextVO context, Map<String, Object> original,
                                               Map<String, Object> supplied, boolean defaultEditable, String instanceId) {
        return validate(context, supplied, true, original == null ? Map.of() : original, true, defaultEditable, instanceId);
    }

    private Map<String, Object> validate(DraftLaunchContextVO context, Map<String, Object> supplied, boolean complete,
                                         Map<String, Object> original, boolean approval, boolean defaultEditable, String instanceId) {
        Map<String, Object> input = new LinkedHashMap<>(supplied == null ? Map.of() : supplied);
        json.data(input);
        if (context.formDefinition() == null) {
            if (!input.isEmpty()) throw new WorkflowException("FORM_INVALID_DATA", "未绑定表单的流程不能提交表单字段");
            return Map.of();
        }
        String schema = json.canonical(context.formDefinition().get("fields"));
        validator.validateFormSchema(schema);
        JsonNode fields = validator.parseFields(schema);
        Map<String, FieldPermissionVO> permissions = new HashMap<>();
        context.fieldPermissions().forEach(permission -> permissions.put(permission.fieldId(), permission));
        Validation validation = new Validation(permissions, new ReferenceLookup(context.definitionId(), instanceId), new LinkedHashMap<>(), approval, defaultEditable, new LinkedHashSet<>());
        Map<String, Object> result = validateScope(fields, input, original, "", "", Map.of(), Set.of(), complete, true, validation);
        if (!validation.errors().isEmpty()) throw new WorkflowFormValidationException(validation.errors(), validation.tamperedFields());
        json.data(result);
        return result;
    }

    private Map<String, Object> validateScope(JsonNode fields, Map<String, Object> supplied, Map<String, Object> original, String permissionPrefix,
                                               String errorPrefix, Map<String, Object> rootValues, Set<String> rootDeclared,
                                               boolean complete, boolean parentEditable, Validation validation) {
        List<FieldEntry> entries = new ArrayList<>();
        collect(fields, List.of(), entries);
        Set<String> declared = new LinkedHashSet<>(rootDeclared);
        collectIds(fields, declared);
        Set<String> accepted = new LinkedHashSet<>();
        Set<String> actual = new LinkedHashSet<>();
        for (FieldEntry entry : entries) {
            String fieldId = entry.field().path("id").asText();
            actual.add(fieldId);
            accepted.add(fieldId);
            if (SINGLE_REFERENCES.contains(entry.field().path("type").asText())) accepted.addAll(derivedTargets(entry.field()));
        }
        if (!permissionPrefix.isEmpty()) accepted.add("_rowId");
        for (String fieldId : supplied.keySet()) if (!accepted.contains(fieldId)) validation.tamper(errorPrefix + fieldId, "表单包含未声明字段");
        Map<String, Object> candidate = new LinkedHashMap<>();
        for (FieldEntry entry : entries) {
            String fieldId = entry.field().path("id").asText();
            Object value = supplied.get(fieldId);
            if (!supplied.containsKey(fieldId) || !baseEditable(entry, permissionPrefix, parentEditable, validation)) {
                value = validation.approval() && original.containsKey(fieldId) ? original.get(fieldId) : defaultValue(entry.field());
            }
            candidate.put(fieldId, normalize(entry.field(), value));
        }
        Map<String, Object> expressions = new LinkedHashMap<>(rootValues);
        expressions.putAll(candidate);
        prepareExpressionNumbers(entries, expressions);
        Map<String, Object> derived = new LinkedHashMap<>();
        Map<String, List<FieldEntry>> sources = new LinkedHashMap<>();
        for (FieldEntry entry : entries) {
            JsonNode field = entry.field();
            if (!SINGLE_REFERENCES.contains(field.path("type").asText())) continue;
            String fieldId = field.path("id").asText();
            Object value = candidate.get(fieldId);
            boolean sourceVisible = visible(entry, permissionPrefix, expressions, declared, validation);
            if (validation.approval() && (!sourceVisible || sameFieldValue(value, normalize(field, original.get(fieldId))))) {
                for (String target : derivedTargets(field)) derive(derived, sources, target, original.get(target), entry, errorPrefix, validation);
                continue;
            }
            if (!sourceVisible) continue;
            Map<String, Object> reference = Map.of();
            if (!empty(value)) {
                try {
                    long referenceId = identifier(value);
                    if (!validation.lookup().referenceAllowed(field.path("type").asText(), referenceId, field)) throw new IllegalArgumentException();
                    reference = validation.lookup().reference(field.path("type").asText(), referenceId, field);
                    String filterId = field.path("filterByDeptFieldId").asText();
                    if (!filterId.isBlank() && !empty(expressions.get(filterId))
                            && (!Set.of("POST", "POSITION").contains(field.path("type").asText()) || reference.get("deptId") != null)
                            && !withinDepartment(reference, field.path("type").asText(), String.valueOf(expressions.get(filterId)))) throw new IllegalArgumentException();
                } catch (IllegalArgumentException exception) {
                    validation.error(errorPrefix + fieldId, "所选记录无效或超出允许范围");
                    continue;
                }
            }
            String displayId = field.path("displayFieldId").asText();
            if (!displayId.isBlank()) derive(derived, sources, displayId, reference.getOrDefault("name", ""), entry, errorPrefix, validation);
            for (JsonNode mapping : field.path("fillMappings")) {
                Object mapped = reference.get(mapping.path("source").asText());
                if (empty(mapped) && mapping.hasNonNull("fallbackSource")) mapped = reference.get(mapping.path("fallbackSource").asText());
                if (!empty(mapped) || mapping.path("clearWhenEmpty").asBoolean(true)) derive(derived, sources, mapping.path("targetFieldId").asText(), empty(mapped) ? "" : mapped, entry, errorPrefix, validation);
            }
        }
        candidate.putAll(derived);
        expressions.putAll(candidate);
        prepareExpressionNumbers(entries, expressions);
        Map<String, Object> result = new LinkedHashMap<>();
        if (!permissionPrefix.isEmpty() && supplied.containsKey("_rowId")) result.put("_rowId", supplied.get("_rowId"));
        for (FieldEntry entry : entries) {
            JsonNode field = entry.field();
            String fieldId = field.path("id").asText();
            String fieldPath = errorPrefix + fieldId;
            Object value = candidate.get(fieldId);
            boolean visible = visible(entry, permissionPrefix, expressions, declared, validation)
                    && sources.getOrDefault(fieldId, List.of()).stream().allMatch(source -> visible(source, permissionPrefix, expressions, declared, validation));
            if (!visible) {
                if (validation.approval()) {
                    if (supplied.containsKey(fieldId) && !sameFieldValue(normalize(field, supplied.get(fieldId)), normalize(field, original.get(fieldId)))) validation.tamper(fieldPath, "隐藏字段不能修改");
                    if (original.containsKey(fieldId)) result.put(fieldId, original.get(fieldId));
                } else if (!empty(supplied.get(fieldId))) validation.tamper(fieldPath, "隐藏字段不能提交外部值");
                continue;
            }
            boolean editable = baseEditable(entry, permissionPrefix, parentEditable, validation)
                    && enabled(entry, expressions, declared);
            if (derived.containsKey(fieldId) || !editable) {
                Object trusted = derived.containsKey(fieldId) ? derived.get(fieldId) : normalize(field, validation.approval() && original.containsKey(fieldId) ? original.get(fieldId) : defaultValue(field));
                if (supplied.containsKey(fieldId) && !sameFieldValue(normalize(field, supplied.get(fieldId)), trusted)) validation.tamper(fieldPath, "只读字段与可信值不一致");
                value = trusted;
            }
            ObjectNode projected = field.deepCopy();
            FieldPermissionVO permission = validation.permissions().get(permissionPrefix + fieldId);
            if (permission != null && permission.requiredFlag() != null) projected.put("required", permission.requiredFlag());
            if (!permissionPrefix.isEmpty() && field.path("type").asText().startsWith("UPLOAD_") && !field.has("maxCount")) projected.put("maxCount", 1);
            if ("SUB_TABLE".equals(field.path("type").asText())) {
                value = validateTable(projected, value, original.get(fieldId), fieldId + ".", fieldPath, expressions, declared, complete, editable, validation);
            } else if (!validation.approval() || !original.containsKey(fieldId) || !sameFieldValue(value, normalize(field, original.get(fieldId)))
                    || complete && projected.path("required").asBoolean() && empty(value)) checkValue(projected, value, errorPrefix, complete, validation, original.get(fieldId));
            if (value != null || supplied.containsKey(fieldId) || validation.approval() && original.containsKey(fieldId)) result.put(fieldId, value);
        }
        for (Map.Entry<String, Object> entry : derived.entrySet()) {
            if (actual.contains(entry.getKey())) continue;
            String target = entry.getKey();
            boolean allowed = permissionVisible(permissionPrefix + target, validation)
                    && sources.get(target).stream().allMatch(source -> visible(source, permissionPrefix, expressions, declared, validation));
            if (!allowed) {
                if (validation.approval()) {
                    if (supplied.containsKey(target) && !equivalent(supplied.get(target), original.get(target))) validation.tamper(errorPrefix + target, "隐藏回填字段不能修改");
                    if (original.containsKey(target)) result.put(target, original.get(target));
                } else if (!empty(supplied.get(target))) validation.tamper(errorPrefix + target, "隐藏回填字段不能提交外部值");
                continue;
            }
            if (supplied.containsKey(target) && !equivalent(supplied.get(target), entry.getValue())) validation.tamper(errorPrefix + target, "回填字段与来源记录不一致");
            result.put(target, entry.getValue());
        }
        for (String target : accepted) if (!actual.contains(target) && !"_rowId".equals(target) && !derived.containsKey(target) && !empty(supplied.get(target))) validation.tamper(errorPrefix + target, "回填字段缺少可见的可信来源");
        return result;
    }

    private Object validateTable(ObjectNode field, Object value, Object originalValue, String permissionPrefix, String path,
                                 Map<String, Object> rootValues, Set<String> declared, boolean complete,
                                 boolean editable, Validation validation) {
        ObjectNode shell = field.deepCopy();
        shell.set("columns", JsonNodeFactory.instance.arrayNode());
        Object shellValue = value;
        if (value instanceof List<?> rows) {
            List<Object> identities = new ArrayList<>();
            for (Object item : rows) {
                if (item instanceof Map<?, ?> row) {
                    Map<String, Object> identity = new LinkedHashMap<>();
                    if (row.containsKey("_rowId")) identity.put("_rowId", row.get("_rowId"));
                    identities.add(identity);
                } else identities.add(item);
            }
            shellValue = identities;
        }
        checkValue(shell, shellValue, path.substring(0, path.length() - field.path("id").asText().length()), complete, validation);
        if (validation.approval() && value == null && originalValue instanceof List<?> previousRows && !previousRows.isEmpty() && !field.path("allowDelete").asBoolean(true)) {
            validation.tamper(path, "当前明细不允许删除行");
        }
        if (!(value instanceof List<?> rows) || rows.size() > 500 || rows.size() > field.path("maxRows").asInt(100)) return value;
        Map<String, Map<String, Object>> originalRows = new LinkedHashMap<>();
        if (validation.approval() && originalValue instanceof List<?> previousRows) {
            for (Object previous : previousRows) if (previous instanceof Map<?, ?> row && row.get("_rowId") instanceof String rowId) {
                Map<String, Object> copied = new LinkedHashMap<>();
                row.forEach((key, item) -> { if (key instanceof String name) copied.put(name, item); });
                if (originalRows.put(rowId, copied) != null) validation.error(path, "原明细行标识重复");
            }
            if (originalRows.size() != previousRows.size()) validation.error(path, "原明细缺少有效行标识");
        }
        List<Object> result = new ArrayList<>();
        List<String> retained = new ArrayList<>();
        for (int rowIndex = 0; rowIndex < rows.size(); rowIndex++) {
            if (!(rows.get(rowIndex) instanceof Map<?, ?> raw)) continue;
            Map<String, Object> row = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : raw.entrySet()) {
                if (!(entry.getKey() instanceof String columnId)) validation.error(path + "[" + rowIndex + "]", "明细列名必须为文字");
                else row.put(columnId, entry.getValue());
            }
            if (!row.containsKey("_rowId")) row.put("_rowId", UUID.randomUUID().toString());
            Map<String, Object> previous = originalRows.getOrDefault(row.get("_rowId"), Map.of());
            if (validation.approval() && previous.isEmpty() && !field.path("allowAdd").asBoolean(true)) validation.tamper(path, "当前明细不允许新增行");
            if (!previous.isEmpty()) retained.add(String.valueOf(row.get("_rowId")));
            result.add(validateScope(field.path("columns"), row, previous, permissionPrefix, path + "[" + rowIndex + "].",
                    rootValues, declared, complete, editable, validation));
        }
        if (validation.approval()) {
            if (!field.path("allowDelete").asBoolean(true) && !new HashSet<>(retained).containsAll(originalRows.keySet())) validation.tamper(path, "当前明细不允许删除行");
            List<String> previousOrder = originalRows.keySet().stream().filter(retained::contains).toList();
            if (!field.path("allowSort").asBoolean(true) && !previousOrder.equals(retained)) validation.tamper(path, "当前明细不允许调整行序");
        }
        return result;
    }

    private void checkValue(JsonNode field, Object value, String prefix, boolean complete, Validation validation) {
        checkValue(field, value, prefix, complete, validation, null);
    }

    private void checkValue(JsonNode field, Object value, String prefix, boolean complete, Validation validation, Object original) {
        String fieldId = field.path("id").asText();
        Map<String, Object> data = new LinkedHashMap<>();
        if (value != null) data.put(fieldId, value);
        validator.validateValues(JsonNodeFactory.instance.arrayNode().add(field), data, complete,
                        validation.lookup().forField((prefix + fieldId).replaceAll("\\[\\d+\\]", ""), original))
                .errors().forEach((path, message) -> validation.error(prefix + path, message));
    }

    private void collect(JsonNode fields, List<JsonNode> ancestors, List<FieldEntry> entries) {
        for (JsonNode field : fields) {
            String type = field.path("type").asText();
            if (JsonSchemaValidator.LAYOUT_TYPES.contains(type)) {
                List<JsonNode> parents = new ArrayList<>(ancestors);
                parents.add(field);
                collect(field.path("children"), List.copyOf(parents), entries);
            } else if (!JsonSchemaValidator.STATIC_TYPES.contains(type)) entries.add(new FieldEntry(field, ancestors));
        }
    }

    private void collectIds(JsonNode fields, Set<String> ids) {
        for (JsonNode field : fields) {
            ids.add(field.path("id").asText());
            if (JsonSchemaValidator.LAYOUT_TYPES.contains(field.path("type").asText())) collectIds(field.path("children"), ids);
        }
    }

    private boolean visible(FieldEntry entry, String prefix, Map<String, Object> values, Set<String> declared, Validation validation) {
        if (!permissionVisible(prefix + entry.field().path("id").asText(), validation)) return false;
        for (JsonNode ancestor : entry.ancestors()) {
            if (!permissionVisible(prefix + ancestor.path("id").asText(), validation) || !expression(ancestor, "visibleExpr", values, declared)) return false;
        }
        return expression(entry.field(), "visibleExpr", values, declared);
    }

    private boolean permissionVisible(String fieldId, Validation validation) {
        FieldPermissionVO permission = validation.permissions().get(fieldId);
        return permission == null || !Boolean.FALSE.equals(permission.visibleFlag());
    }

    private boolean baseEditable(FieldEntry entry, String prefix, boolean parentEditable, Validation validation) {
        if (!parentEditable || !fieldEditable(entry.field(), prefix, validation)) return false;
        return entry.ancestors().stream().allMatch(ancestor -> fieldEditable(ancestor, prefix, validation));
    }

    private boolean fieldEditable(JsonNode field, String prefix, Validation validation) {
        FieldPermissionVO permission = validation.permissions().get(prefix + field.path("id").asText());
        return !field.path("readonly").asBoolean() && (permission != null && permission.editableFlag() != null ? permission.editableFlag() : validation.defaultEditable());
    }

    private boolean enabled(FieldEntry entry, Map<String, Object> values, Set<String> declared) {
        return expression(entry.field(), "disabledExpr", values, declared)
                && entry.ancestors().stream().allMatch(ancestor -> expression(ancestor, "disabledExpr", values, declared));
    }

    private boolean expression(JsonNode field, String property, Map<String, Object> values, Set<String> declared) {
        String expression = field.path(property).asText();
        if (expression.isBlank()) return true;
        RestrictedExpression.BooleanResult result = RestrictedExpression.evaluatePredicate(expression, values, declared);
        if (!result.valid()) log.warn("表单条件求值失败 fieldId={} property={}", field.path("id").asText(), property);
        return result.valid() && ("disabledExpr".equals(property) ? !result.value() : result.value());
    }

    private void prepareExpressionNumbers(List<FieldEntry> entries, Map<String, Object> values) {
        for (FieldEntry entry : entries) {
            JsonNode field = entry.field();
            if (!Set.of("NUMBER", "AMOUNT").contains(field.path("type").asText())) continue;
            String fieldId = field.path("id").asText();
            Object value = values.get(fieldId);
            if (empty(value)) { values.put(fieldId, null); continue; }
            if (!(value instanceof String) && !(value instanceof Number)) continue;
            try {
                BigDecimal number = new BigDecimal(String.valueOf(value));
                if (Math.abs((long) number.scale()) <= 128 && number.precision() <= 128) values.put(fieldId, number);
            } catch (NumberFormatException exception) {
                values.put(fieldId, null);
            }
        }
    }

    private Set<String> derivedTargets(JsonNode field) {
        Set<String> targets = new LinkedHashSet<>();
        if (field.hasNonNull("displayFieldId")) targets.add(field.path("displayFieldId").asText());
        if (field.has("fillMappings") && !field.path("fillMappings").isArray()) throw WorkflowException.validationError("回填规则必须为数组");
        for (JsonNode mapping : field.path("fillMappings")) {
            targets.add(mapping.path("targetFieldId").asText());
            for (String property : List.of("source", "fallbackSource")) {
                if ("fallbackSource".equals(property) && !mapping.hasNonNull(property)) continue;
                if (!mapping.path(property).isTextual() || !mapping.path(property).asText().matches("[A-Za-z_][A-Za-z0-9_]{0,99}")) throw WorkflowException.validationError("回填来源配置无效");
            }
        }
        for (String target : targets) if (!target.matches("[A-Za-z_][A-Za-z0-9_]{0,99}") || Set.of("__proto__", "constructor", "prototype", "_rowId").contains(target) || target.equals(field.path("id").asText())) throw WorkflowException.validationError("回填目标配置无效");
        return targets;
    }

    private void derive(Map<String, Object> values, Map<String, List<FieldEntry>> sources, String target, Object value,
                        FieldEntry source, String prefix, Validation validation) {
        if (values.containsKey(target) && !equivalent(values.get(target), value)) validation.error(prefix + target, "多个回填来源存在冲突");
        else values.put(target, value);
        sources.computeIfAbsent(target, ignored -> new ArrayList<>()).add(source);
    }

    private Object defaultValue(JsonNode field) {
        return field.hasNonNull("defaultValue") ? json.value(field.get("defaultValue")) : null;
    }

    private Object normalize(JsonNode field, Object value) {
        if (empty(value)) return value;
        String type = field.path("type").asText();
        try {
            if (("NUMBER".equals(type) || "AMOUNT".equals(type)) && (value instanceof String || value instanceof Number)) {
                BigDecimal number = new BigDecimal(String.valueOf(value)).stripTrailingZeros();
                if (Math.abs((long) number.scale()) > 128 || number.precision() > 128) return value;
                return "AMOUNT".equals(type) ? number.toPlainString() : number;
            }
            if (SINGLE_REFERENCES.contains(type)) return String.valueOf(identifier(value));
            if (Set.of("USER_MULTI", "DEPT_MULTI", "UPLOAD_FILE", "UPLOAD_IMAGE").contains(type) && value instanceof List<?> selections) {
                List<String> normalized = new ArrayList<>();
                for (Object selection : selections) normalized.add(String.valueOf(identifier(selection)));
                return normalized;
            }
        } catch (IllegalArgumentException | ArithmeticException exception) {
            return value;
        }
        return value;
    }

    private static long identifier(Object value) {
        if (!(value instanceof Number) && !(value instanceof String)) throw new IllegalArgumentException();
        try {
            long referenceId = new BigDecimal(String.valueOf(value)).longValueExact();
            if (referenceId <= 0) throw new IllegalArgumentException();
            return referenceId;
        } catch (ArithmeticException exception) { throw new IllegalArgumentException(); }
    }

    private static boolean withinDepartment(Map<String, Object> reference, String type, String scope) {
        if (scope == null || scope.isBlank()) return true;
        String department = String.valueOf(reference.get(Set.of("DEPT", "DEPT_MULTI").contains(type) ? "id" : "deptId"));
        if (department.equals(scope)) return true;
        Object ancestors = reference.getOrDefault("deptAncestors", reference.get("ancestors"));
        if (ancestors == null) return false;
        for (String ancestor : String.valueOf(ancestors).split(",")) if (scope.equals(ancestor.trim())) return true;
        return false;
    }

    // Declared fields have already been normalized by their schema. Preserve JSON types when
    // deciding whether an approval can retain a value without revalidating historical references.
    private boolean sameFieldValue(Object left, Object right) {
        return Objects.equals(left, right) || left != null && right != null && json.canonical(left).equals(json.canonical(right));
    }

    private boolean equivalent(Object left, Object right) {
        if (Objects.equals(left, right)) return true;
        if (left == null || right == null) return false;
        if (left instanceof Map<?, ?> || left instanceof Collection<?> || right instanceof Map<?, ?> || right instanceof Collection<?>) return json.canonical(left).equals(json.canonical(right));
        return String.valueOf(left).equals(String.valueOf(right));
    }

    private static boolean empty(Object value) {
        return value == null || value instanceof String text && text.isBlank() || value instanceof Collection<?> values && values.isEmpty();
    }

    private final class ReferenceLookup implements JsonSchemaValidator.ValueLookup {
        private final Map<String, Map<String, Object>> records = new HashMap<>();
        private final Map<String, Set<String>> dictionaries = new HashMap<>();
        private final Map<String, JsonSchemaValidator.FileValue> files = new HashMap<>();
        private final String definitionId;
        private final String instanceId;

        private ReferenceLookup(String definitionId, String instanceId) { this.definitionId = definitionId; this.instanceId = instanceId; }

        private JsonSchemaValidator.ValueLookup forField(String fieldPath, Object original) {
            Set<Long> retained = new HashSet<>();
            if (instanceId != null && original instanceof List<?> values) for (Object value : values) {
                try { retained.add(identifier(value)); } catch (IllegalArgumentException ignored) { }
            }
            return new JsonSchemaValidator.ValueLookup() {
                public Set<String> dictionaryValues(String type) { return ReferenceLookup.this.dictionaryValues(type); }
                public boolean referenceAllowed(String type, long referenceId, JsonNode field) { return ReferenceLookup.this.referenceAllowed(type, referenceId, field); }
                public JsonSchemaValidator.FileValue file(long fileId) { return ReferenceLookup.this.file(fileId, fieldPath, retained.contains(fileId)); }
            };
        }

        public Set<String> dictionaryValues(String dictType) {
            return dictionaries.computeIfAbsent(dictType, key -> {
                List<String> values = references.findDictionaryValues(WorkflowLaunchContextService.requireTenant(), key);
                return values == null ? Set.of() : new HashSet<>(values);
            });
        }

        private Map<String, Object> reference(String type, long referenceId, JsonNode field) {
            boolean onlyActive = field.path("onlyActive").asBoolean(true);
            String key = type + ":" + referenceId + ":" + onlyActive;
            return records.computeIfAbsent(key, ignored -> {
                Map<String, Object> source = references.findReference(WorkflowLaunchContextService.requireTenant(), type, referenceId, onlyActive);
                if (source == null) return Map.of();
                Map<String, Object> result = new LinkedHashMap<>(source);
                result.replaceAll((name, value) -> value != null && ("id".equals(name) || name.endsWith("Id")) ? String.valueOf(value) : value);
                return result;
            });
        }

        public boolean referenceAllowed(String type, long referenceId, JsonNode field) {
            Map<String, Object> record = reference(type, referenceId, field);
            return !record.isEmpty() && withinDepartment(record, type, field.path("scopeDeptId").asText());
        }

        public JsonSchemaValidator.FileValue file(long fileId) {
            return null;
        }

        private JsonSchemaValidator.FileValue file(long fileId, String fieldPath, boolean retained) {
            String cacheKey = fieldPath + ":" + fileId;
            if (files.containsKey(cacheKey)) return files.get(cacheKey);
            String userName = UserContext.getUserName();
            if (userName == null || userName.isBlank()) return null;
            Map<String, Object> record = references.findOwnedFormFile(WorkflowLaunchContextService.requireTenant(), retained ? null : userName,
                    fileId, definitionId, instanceId, fieldPath);
            JsonSchemaValidator.FileValue file = null;
            if (record != null && record.get("size") instanceof Number size && size.longValue() >= 0 && record.get("extension") instanceof String extension) file = new JsonSchemaValidator.FileValue(size.longValue(), extension);
            files.put(cacheKey, file);
            return file;
        }
    }

    private record FieldEntry(JsonNode field, List<JsonNode> ancestors) {
    }

    private record Validation(Map<String, FieldPermissionVO> permissions, ReferenceLookup lookup, Map<String, String> errors,
                              boolean approval, boolean defaultEditable, Set<String> tamperedFields) {
        private void error(String path, String message) { errors.putIfAbsent(path, message); }
        private void tamper(String path, String message) { error(path, message); tamperedFields.add(path); }
    }
}
