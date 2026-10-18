package com.cloudflow.workflow.service;

import com.cloudflow.common.core.utils.RestrictedExpression;
import com.cloudflow.workflow.domain.vo.FieldPermissionVO;
import com.cloudflow.workflow.validator.JsonSchemaValidator;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
@Slf4j
public class FormDataPermissionFilter {
    private final ObjectMapper mapper;
    private final JsonSchemaValidator validator;

    public Projection filter(String schema, Map<String, Object> rawValues, List<FieldPermissionVO> permissions,
                             Set<String> nodeKeys, boolean defaultEditable) {
        JsonNode fields = validator.parseFields(schema);
        Set<String> nodes = nodeKeys == null || nodeKeys.isEmpty() ? Set.of("__OBSERVER__") : Set.copyOf(nodeKeys);
        Map<String, FieldPermissionVO> indexed = new LinkedHashMap<>();
        if (permissions != null) for (FieldPermissionVO permission : permissions) {
            indexed.put(permission.nodeKey() + ":" + permission.fieldId(), permission);
        }
        Rules rules = new Rules(indexed, nodes, defaultEditable);
        Map<String, Object> values = rawValues == null ? Map.of() : rawValues;
        Set<String> declared = declared(fields);
        Set<String> visible = allowedFields(fields, "", rules, null, Set.of());
        Map<String, Object> scope = expressionValues(fields, values, Map.of());
        List<FieldPermissionVO> effective = new ArrayList<>();
        ArrayNode definition = filterFields(fields, "", scope, declared, visible, false, rules, effective);
        Map<String, Object> data = filterValues(fields, values, "", Map.of(), Set.of(), true, rules);
        Set<String> retained = allowedFields(definition, "", rules, null, Set.of());
        data.keySet().removeIf(fieldId -> !retained.contains(fieldId));
        return new Projection(definition, data, effective.stream().filter(permission -> retained.contains(permission.fieldId())).toList());
    }

    private ArrayNode filterFields(JsonNode fields, String prefix, Map<String, Object> values, Set<String> declared,
                                   Set<String> visible, boolean parentReadonly, Rules rules,
                                   List<FieldPermissionVO> effective) {
        ArrayNode result = mapper.createArrayNode();
        for (JsonNode field : fields) {
            String fieldId = field.path("id").asText();
            String path = prefix + fieldId;
            if (!visible.contains(path)) continue;
            ObjectNode projected = field.deepCopy();
            boolean readonly = parentReadonly || field.path("readonly").asBoolean() || !rules.editable(path);
            boolean required = rules.required(path, field.path("required").asBoolean());
            projected.put("readonly", readonly);
            projected.put("required", required);
            sanitizeExpression(projected, "visibleExpr", values, declared, visible, prefix);
            sanitizeExpression(projected, "disabledExpr", values, declared, visible, prefix);
            if (projected.hasNonNull("displayFieldId") && !visible.contains(prefix + projected.path("displayFieldId").asText())) projected.remove("displayFieldId");
            if (projected.hasNonNull("filterByDeptFieldId") && !visible.contains(prefix + projected.path("filterByDeptFieldId").asText())) projected.remove("filterByDeptFieldId");
            if (projected.path("fillMappings").isArray()) {
                ArrayNode mappings = mapper.createArrayNode();
                for (JsonNode mapping : projected.path("fillMappings")) if (visible.contains(prefix + mapping.path("targetFieldId").asText())) mappings.add(mapping.deepCopy());
                projected.set("fillMappings", mappings);
            }
            String type = field.path("type").asText();
            if (JsonSchemaValidator.LAYOUT_TYPES.contains(type)) {
                ArrayNode children = filterFields(field.path("children"), prefix, values, declared, visible, readonly, rules, effective);
                if (children.isEmpty()) continue;
                projected.set("children", children);
            } else if ("SUB_TABLE".equals(type)) {
                JsonNode columns = field.path("columns");
                Set<String> columnIds = new LinkedHashSet<>(declared);
                columnIds.addAll(declared(columns));
                Map<String, Object> rowScope = expressionValues(columns, Map.of(), values);
                ArrayNode allowedColumns = filterFields(columns, fieldId + ".", rowScope, columnIds, visible, readonly, rules, effective);
                if (allowedColumns.isEmpty()) continue;
                projected.set("columns", allowedColumns);
                if (projected.has("defaultValue")) projected.set("defaultValue", mapper.valueToTree(filterRows(columns,
                        mapper.convertValue(projected.get("defaultValue"), Object.class), fieldId + ".", values, declared, true, rules)));
                if (projected.path("summaryColumns").isArray()) {
                    ArrayNode summaries = mapper.createArrayNode();
                    for (JsonNode summary : projected.path("summaryColumns")) if (visible.contains(fieldId + "." + summary.path("columnId").asText())) summaries.add(summary.deepCopy());
                    projected.set("summaryColumns", summaries);
                }
            }
            result.add(projected);
            effective.add(new FieldPermissionVO(rules.nodeKey(), path, true, !projected.path("readonly").asBoolean(), required));
        }
        return result;
    }

    private Map<String, Object> filterValues(JsonNode fields, Map<String, Object> rawValues, String prefix,
                                              Map<String, Object> rootValues, Set<String> rootDeclared,
                                              boolean parentVisible, Rules rules) {
        Map<String, Object> scope = expressionValues(fields, rawValues, rootValues);
        Set<String> declared = new LinkedHashSet<>(rootDeclared);
        declared.addAll(declared(fields));
        Set<String> allowed = allowedFields(fields, prefix, rules, scope, declared);
        return filterValues(fields, rawValues, prefix, scope, declared, allowed, rules);
    }

    private Map<String, Object> filterValues(JsonNode fields, Map<String, Object> rawValues, String prefix,
                                             Map<String, Object> scope, Set<String> declared, Set<String> allowed, Rules rules) {
        Map<String, Object> result = new LinkedHashMap<>();
        if (!prefix.isEmpty() && rawValues.get("_rowId") instanceof String rowId) result.put("_rowId", rowId);
        for (JsonNode field : fields) {
            String fieldId = field.path("id").asText();
            String path = prefix + fieldId;
            if (!allowed.contains(path)) continue;
            String type = field.path("type").asText();
            if (JsonSchemaValidator.LAYOUT_TYPES.contains(type)) {
                result.putAll(filterValues(field.path("children"), rawValues, prefix, scope, declared, allowed, rules));
            } else if (!JsonSchemaValidator.STATIC_TYPES.contains(type) && rawValues.containsKey(fieldId)) {
                Object value = rawValues.get(fieldId);
                if ("SUB_TABLE".equals(type)) value = filterRows(field.path("columns"), value, fieldId + ".", scope, declared, true, rules);
                else value = mapper.convertValue(mapper.valueToTree(value), Object.class);
                result.put(fieldId, value);
            }
            if (field.hasNonNull("displayFieldId")) copyDerived(result, rawValues, prefix, field.path("displayFieldId").asText(), allowed);
            for (JsonNode mapping : field.path("fillMappings")) copyDerived(result, rawValues, prefix, mapping.path("targetFieldId").asText(), allowed);
        }
        return result;
    }

    private Object filterRows(JsonNode fields, Object value, String prefix, Map<String, Object> rootValues,
                              Set<String> rootDeclared, boolean parentVisible, Rules rules) {
        if (!(value instanceof List<?> rows)) return List.of();
        List<Map<String, Object>> result = new ArrayList<>();
        for (Object row : rows) {
            if (!(row instanceof Map<?, ?> raw)) continue;
            Map<String, Object> data = new LinkedHashMap<>();
            raw.forEach((key, item) -> { if (key instanceof String name) data.put(name, item); });
            result.add(filterValues(fields, data, prefix, rootValues, rootDeclared, parentVisible, rules));
        }
        return result;
    }

    private void copyDerived(Map<String, Object> result, Map<String, Object> raw, String prefix, String fieldId, Set<String> allowed) {
        if (allowed.contains(prefix + fieldId) && raw.containsKey(fieldId)) result.putIfAbsent(fieldId, mapper.convertValue(mapper.valueToTree(raw.get(fieldId)), Object.class));
    }

    private Set<String> allowedFields(JsonNode fields, String prefix, Rules rules, Map<String, Object> values, Set<String> declared) {
        Set<String> allowed = new LinkedHashSet<>();
        Set<String> denied = new LinkedHashSet<>();
        Map<String, Set<String>> derived = new LinkedHashMap<>();
        collectVisible(fields, prefix, true, rules, values, declared, allowed, denied, derived);
        allowed.removeAll(denied);
        boolean changed;
        do {
            changed = false;
            for (Map.Entry<String, Set<String>> entry : derived.entrySet()) if (!allowed.contains(entry.getKey())) changed |= allowed.removeAll(entry.getValue());
        } while (changed);
        return allowed;
    }

    private void collectVisible(JsonNode fields, String prefix, boolean parentVisible, Rules rules, Map<String, Object> values,
                                Set<String> declared, Set<String> visible, Set<String> denied, Map<String, Set<String>> derived) {
        for (JsonNode field : fields) {
            String fieldId = field.path("id").asText();
            String path = prefix + fieldId;
            boolean allowed = parentVisible && rules.visible(path) && (values == null || predicate(field, "visibleExpr", values, declared));
            Set<String> targets = new LinkedHashSet<>();
            String displayId = field.path("displayFieldId").asText();
            if (!displayId.isBlank()) targets.add(prefix + displayId);
            for (JsonNode mapping : field.path("fillMappings")) targets.add(prefix + mapping.path("targetFieldId").asText());
            derived.put(path, targets);
            if (allowed) {
                visible.add(path);
                for (String target : targets) if (rules.visible(target)) visible.add(target);
            } else denied.add(path);
            if (JsonSchemaValidator.LAYOUT_TYPES.contains(field.path("type").asText())) collectVisible(field.path("children"), prefix, allowed, rules, values, declared, visible, denied, derived);
            if (values == null && "SUB_TABLE".equals(field.path("type").asText())) collectVisible(field.path("columns"), fieldId + ".", allowed, rules, null, Set.of(), visible, denied, derived);
        }
    }

    private void sanitizeExpression(ObjectNode field, String property, Map<String, Object> values, Set<String> declared,
                                    Set<String> visible, String prefix) {
        String expression = field.path(property).asText();
        if (expression.isBlank()) return;
        try {
            Set<String> references = RestrictedExpression.referencedFields(expression, declared);
            if (references.stream().anyMatch(reference -> !visible.contains(prefix + reference) && !visible.contains(reference))) {
                if (!prefix.isEmpty()) {
                    field.remove(property);
                    field.put("readonly", true);
                    return;
                }
                boolean enabled = predicate(field, property, values, declared);
                field.put(property, String.valueOf("disabledExpr".equals(property) ? !enabled : enabled));
            }
        } catch (IllegalArgumentException invalid) {
            field.put(property, "disabledExpr".equals(property) ? "true" : "false");
            log.warn("表单条件不可下发 fieldId={} property={}", field.path("id").asText(), property);
        }
    }

    private boolean predicate(JsonNode field, String property, Map<String, Object> values, Set<String> declared) {
        String expression = field.path(property).asText();
        if (expression.isBlank()) return true;
        RestrictedExpression.BooleanResult result = RestrictedExpression.evaluatePredicate(expression, values, declared);
        if (!result.valid()) log.warn("表单响应条件求值失败 fieldId={} property={}", field.path("id").asText(), property);
        return result.valid() && ("disabledExpr".equals(property) ? !result.value() : result.value());
    }

    private Map<String, Object> expressionValues(JsonNode fields, Map<String, Object> raw, Map<String, Object> root) {
        Map<String, Object> values = new LinkedHashMap<>(root);
        fillExpressionValues(fields, raw, values);
        return values;
    }

    private void fillExpressionValues(JsonNode fields, Map<String, Object> raw, Map<String, Object> result) {
        for (JsonNode field : fields) {
            if (JsonSchemaValidator.LAYOUT_TYPES.contains(field.path("type").asText())) { fillExpressionValues(field.path("children"), raw, result); continue; }
            String fieldId = field.path("id").asText();
            Object value = raw.containsKey(fieldId) ? raw.get(fieldId) : field.has("defaultValue") ? mapper.convertValue(field.get("defaultValue"), Object.class) : null;
            if (Set.of("AMOUNT", "NUMBER").contains(field.path("type").asText()) && value != null) {
                try {
                    BigDecimal number = new BigDecimal(String.valueOf(value));
                    value = Math.abs((long) number.scale()) <= 128 && number.precision() <= 128 ? number : null;
                } catch (NumberFormatException invalid) { value = null; }
            }
            result.put(fieldId, value);
        }
    }

    private Set<String> declared(JsonNode fields) {
        Set<String> result = new LinkedHashSet<>();
        for (JsonNode field : fields) {
            result.add(field.path("id").asText());
            if (JsonSchemaValidator.LAYOUT_TYPES.contains(field.path("type").asText())) result.addAll(declared(field.path("children")));
        }
        return result;
    }

    public record Projection(ArrayNode fields, Map<String, Object> values, List<FieldPermissionVO> permissions) { }

    private record Rules(Map<String, FieldPermissionVO> permissions, Set<String> nodes, boolean defaultEditable) {
        boolean visible(String fieldId) {
            return nodes.stream().allMatch(node -> { FieldPermissionVO permission = permissions.get(node + ":" + fieldId); return permission == null || !Boolean.FALSE.equals(permission.visibleFlag()); });
        }
        boolean editable(String fieldId) {
            return nodes.stream().allMatch(node -> { FieldPermissionVO permission = permissions.get(node + ":" + fieldId); return permission != null && permission.editableFlag() != null ? permission.editableFlag() : defaultEditable; });
        }
        boolean required(String fieldId, boolean inherited) {
            return nodes.stream().anyMatch(node -> { FieldPermissionVO permission = permissions.get(node + ":" + fieldId); return permission != null && permission.requiredFlag() != null ? permission.requiredFlag() : inherited; });
        }
        String nodeKey() { return nodes.size() == 1 ? nodes.iterator().next() : "__READ__"; }
    }
}
