package com.cloudflow.workflow.service;

import com.cloudflow.workflow.validator.JsonSchemaValidator;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.DecimalNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.LongNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class WorkflowFormVersionDiff {
    private final WorkflowDraftJson json;
    private final JsonSchemaValidator validator;

    public String normalized(String schema) { return json.canonical(normalize(validator.parseFields(schema))); }
    public String checksum(String schema) { return json.hash(json.tree(normalized(schema))); }

    public Difference compare(String before, String after, Integer fromVersion, Integer toVersion) {
        Map<String, LocatedField> previous = index(validator.parseFields(before));
        Map<String, LocatedField> next = index(validator.parseFields(after));
        List<FieldChange> added = new ArrayList<>(); List<FieldChange> removed = new ArrayList<>(); List<FieldChange> modified = new ArrayList<>();
        List<LayoutChange> layout = new ArrayList<>();
        for (Map.Entry<String, WorkflowFormVersionDiff.LocatedField> entry : next.entrySet()) {
            LocatedField current = entry.getValue(); LocatedField original = previous.get(entry.getKey());
            if (original == null) {
                if (current.layout()) layout.add(new LayoutChange(entry.getKey(), current.label(), null, current.location(), null, current.attributes()));
                else added.add(change(entry.getKey(), null, current));
                continue;
            }
            boolean propertiesChanged = !json.canonical(original.attributes()).equals(json.canonical(current.attributes()));
            boolean moved = !Objects.equals(original.location().parent(), current.location().parent())
                    || commonOrder(previous, next, entry.getKey()) != commonOrder(next, previous, entry.getKey());
            if (propertiesChanged) {
                FieldChange change = change(entry.getKey(), original, current);
                if (current.layout() && original.layout() || change.properties().keySet().stream().allMatch(Set.of("span", "width", "align")::contains)) {
                    layout.add(new LayoutChange(entry.getKey(), current.label(), original.location(), current.location(), original.attributes(), current.attributes()));
                } else modified.add(change);
            }
            if (moved && layout.stream().noneMatch(change -> change.fieldId().equals(entry.getKey()))) {
                layout.add(new LayoutChange(entry.getKey(), current.label(), original.location(), current.location(), original.attributes(), current.attributes()));
            }
        }
        for (Map.Entry<String, WorkflowFormVersionDiff.LocatedField> entry : previous.entrySet()) if (!next.containsKey(entry.getKey())) {
            LocatedField original = entry.getValue();
            if (original.layout()) layout.add(new LayoutChange(entry.getKey(), original.label(), original.location(), null, original.attributes(), null));
            else removed.add(change(entry.getKey(), original, null));
        }
        List<String> kinds = new ArrayList<>();
        if (!added.isEmpty()) kinds.add("ADD_FIELD"); if (!removed.isEmpty()) kinds.add("REMOVE_FIELD");
        if (!modified.isEmpty()) kinds.add("MODIFY_FIELD"); if (!layout.isEmpty()) kinds.add("LAYOUT_CHANGE");
        String type = kinds.isEmpty() ? "UNCHANGED" : kinds.size() == 1 ? kinds.get(0) : "MIXED";
        String summary = "新增" + added.size() + "个字段，删除" + removed.size() + "个字段，修改" + modified.size() + "个字段，布局调整" + layout.size() + "处";
        return new Difference(fromVersion, toVersion, type, summary, List.copyOf(added), List.copyOf(removed), List.copyOf(modified), List.copyOf(layout));
    }

    private JsonNode normalize(JsonNode value) {
        if (value.isObject()) {
            ObjectNode result = JsonNodeFactory.instance.objectNode();
            value.fields().forEachRemaining(entry -> { if (!"_rowId".equals(entry.getKey())) result.set(entry.getKey(), normalize(entry.getValue())); });
            return result;
        }
        if (value.isArray()) { ArrayNode result = JsonNodeFactory.instance.arrayNode(); value.forEach(item -> result.add(normalize(item))); return result; }
        if (!value.isNumber()) return value;
        BigDecimal number = value.decimalValue().stripTrailingZeros();
        // Whole configuration values must remain integer JSON tokens when the saved schema is read again.
        return number.scale() <= 0 && value.canConvertToLong() ? LongNode.valueOf(number.longValueExact()) : DecimalNode.valueOf(number);
    }

    private Map<String, LocatedField> index(JsonNode fields) {
        Map<String, LocatedField> result = new LinkedHashMap<>(); collect(fields, "", "root", result); return result;
    }

    private void collect(JsonNode fields, String prefix, String parent, Map<String, LocatedField> result) {
        int order = 0;
        for (JsonNode field : fields) {
            String fieldId = prefix + field.path("id").asText(); String type = field.path("type").asText();
            boolean layout = JsonSchemaValidator.LAYOUT_TYPES.contains(type) || JsonSchemaValidator.STATIC_TYPES.contains(type);
            ObjectNode attributes = (ObjectNode) normalize(field);
            attributes.remove("children"); if (attributes.path("columns").isArray()) attributes.remove("columns");
            result.put(fieldId, new LocatedField(field.path("label").asText(fieldId), attributes, new Location(parent, order++), layout));
            if (JsonSchemaValidator.LAYOUT_TYPES.contains(type)) collect(field.path("children"), prefix, parent + "/" + fieldId, result);
            if ("SUB_TABLE".equals(type)) collect(field.path("columns"), field.path("id").asText() + ".", parent + "/" + fieldId, result);
        }
    }

    private FieldChange change(String fieldId, LocatedField original, LocatedField current) {
        Map<String, PropertyChange> properties = new LinkedHashMap<>();
        Set<String> names = new LinkedHashSet<>();
        if (original != null) original.attributes().fieldNames().forEachRemaining(names::add);
        if (current != null) current.attributes().fieldNames().forEachRemaining(names::add);
        for (String name : names) {
            JsonNode before = original == null ? null : original.attributes().get(name);
            JsonNode after = current == null ? null : current.attributes().get(name);
            if (!json.canonical(before).equals(json.canonical(after))) properties.put(name, new PropertyChange(before, after));
        }
        return new FieldChange(fieldId, current == null ? original.label() : current.label(), original == null ? null : original.attributes(),
                current == null ? null : current.attributes(), Map.copyOf(properties));
    }

    private int commonOrder(Map<String, LocatedField> source, Map<String, LocatedField> other, String fieldId) {
        String parent = source.get(fieldId).location().parent();
        int order = 0;
        for (Map.Entry<String, WorkflowFormVersionDiff.LocatedField> entry : source.entrySet()) {
            LocatedField counterpart = other.get(entry.getKey());
            if (counterpart == null || !parent.equals(entry.getValue().location().parent()) || !parent.equals(counterpart.location().parent())) continue;
            if (fieldId.equals(entry.getKey())) return order;
            order++;
        }
        return -1;
    }

    private record LocatedField(String label, ObjectNode attributes, Location location, boolean layout) { }
    public record Location(String parent, int order) { }
    public record PropertyChange(JsonNode before, JsonNode after) { }
    public record FieldChange(String fieldId, String label, JsonNode before, JsonNode after, Map<String, PropertyChange> properties) { }
    public record LayoutChange(String fieldId, String label, Location from, Location to, JsonNode before, JsonNode after) { }
    public record Difference(Integer fromVersion, Integer toVersion, String changeType, String summary, List<FieldChange> added,
                             List<FieldChange> removed, List<FieldChange> modified, List<LayoutChange> layoutChanges) { }
}
