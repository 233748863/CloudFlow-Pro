package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.entity.HrCompComponent;
import com.cloudflow.hr.domain.entity.HrEmployeeComp;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Captures project identity at payroll generation; never resolves historical wages by display name. */
public final class HrPayrollComponentSnapshot {
    private HrPayrollComponentSnapshot() { }

    public static List<Long> numericKeys(Map<String, Object> values) {
        List<Long> ids = new ArrayList<>();
        if (values == null) return ids;
        for (String key : values.keySet()) {
            if (key == null || !key.matches("[1-9][0-9]{0,18}")) continue;
            try { ids.add(Long.valueOf(key)); }
            catch (NumberFormatException ignored) { /* Out-of-range keys can still be exact component codes. */ }
        }
        return ids;
    }

    public static List<Map<String, Object>> earnings(HrEmployeeComp compensation, BigDecimal gross,
                                                    List<HrCompComponent> candidates) {
        List<Map<String, Object>> rows = new ArrayList<>();
        Map<String, Object> values = compensation.getComponentValues();
        Map<String, Long> occurrences = new HashMap<>();
        if (values != null && !values.isEmpty()) {
            for (Map.Entry<String, Object> entry : values.entrySet()) {
                Map<String, Object> row = row(compensation, entry.getKey(), entry.getValue());
                row.put("salaryComponentKey", entry.getKey());
                List<HrCompComponent> matches = candidates.stream()
                        .filter(component -> component.getId() != null && Objects.equals(compensation.getTenantId(), component.getTenantId()))
                        .filter(component -> Objects.equals(entry.getKey(), component.getComponentCode())
                                || component.getId().toString().equals(entry.getKey())).toList();
                if (matches.size() == 1) {
                    HrCompComponent component = matches.get(0);
                    String id = component.getId().toString();
                    row.put("salaryComponentId", id);
                    row.put("salaryComponentCode", component.getComponentCode());
                    row.put("salaryComponentName", component.getComponentName());
                    row.put("salaryComponentType", component.getComponentType());
                    row.put("salaryComponentVersion", component.getVersion());
                    row.put("salaryComponentIdentity", "VERIFIED");
                    occurrences.merge(id, 1L, Long::sum);
                } else row.put("salaryComponentIdentity", matches.isEmpty() ? "UNRESOLVED" : "AMBIGUOUS");
                rows.add(row);
            }
            for (Map<String, Object> row : rows) {
                if (occurrences.getOrDefault(row.get("salaryComponentId"), 0L) > 1) {
                    row.put("salaryComponentIdentity", "DUPLICATE");
                    row.remove("salaryComponentId");
                }
            }
        } else {
            Map<String, Object> row = row(compensation, "基本工资", gross);
            row.put("salaryComponentIdentity", "UNASSIGNED");
            rows.add(row);
        }
        return rows;
    }

    private static Map<String, Object> row(HrEmployeeComp compensation, String name, Object amount) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("name", name); row.put("type", "EARNING"); row.put("amount", amount);
        row.put("sourceType", "EMPLOYEE_COMPENSATION");
        row.put("employeeCompId", compensation.getId() == null ? null : compensation.getId().toString());
        row.put("employeeCompVersion", compensation.getVersion());
        row.put("structureId", compensation.getStructureId() == null ? null : compensation.getStructureId().toString());
        return row;
    }
}
