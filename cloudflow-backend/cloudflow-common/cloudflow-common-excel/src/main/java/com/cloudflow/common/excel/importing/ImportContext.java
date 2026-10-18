package com.cloudflow.common.excel.importing;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.Getter;

@Getter
public class ImportContext {
    private final long tenantId;
    private final long operatorId;
    private final String operatorName;
    private final Set<String> fileKeys = new HashSet<>();
    private final Map<String, List<ImportReference>> references = new LinkedHashMap<>();
    private final Map<String, Map<String, List<Object>>> codes = new HashMap<>();
    private final Map<String, Map<String, List<Object>>> names = new HashMap<>();

    public ImportContext(long tenantId, long operatorId, String operatorName) {
        this.tenantId = tenantId;
        this.operatorId = operatorId;
        this.operatorName = operatorName;
    }

    public void addReferences(String type, List<ImportReference> values) {
        references.put(type, List.copyOf(values));
        Map<String, List<Object>> codeIndex = new HashMap<>();
        Map<String, List<Object>> nameIndex = new HashMap<>();
        values.forEach(value -> {
            index(codeIndex, value.code(), value.value());
            index(nameIndex, value.name(), value.value());
        });
        codes.put(type, codeIndex);
        names.put(type, nameIndex);
    }

    private void index(Map<String, List<Object>> target, String key, Object value) {
        if (key != null && !key.isBlank() && value != null) {
            List<Object> matches = target.computeIfAbsent(ImportKeys.normalize(key), ignored -> new ArrayList<>());
            if (!matches.contains(value)) matches.add(value);
        }
    }

    public Object resolve(String type, String input) {
        String normalized = ImportKeys.normalize(input);
        List<Object> matches = codes.getOrDefault(type, Map.of()).get(normalized);
        if (matches == null) matches = names.getOrDefault(type, Map.of()).get(normalized);
        if (matches == null || matches.isEmpty()) throw new IllegalArgumentException("引用不存在或已停用，请检查编号或名称");
        if (matches.size() != 1) throw new IllegalArgumentException("引用存在重名，请改用编号");
        return matches.get(0);
    }

    public List<String> choices(String type) {
        return references.getOrDefault(type, List.of()).stream().map(value -> {
            List<Object> matched = names.getOrDefault(type, Map.of()).get(ImportKeys.normalize(value.name()));
            return matched != null && matched.size() == 1 ? value.name() : value.code();
        }).filter(value -> value != null && !value.isBlank()).distinct().toList();
    }
}
